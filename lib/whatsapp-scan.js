import { createServiceClient } from '@/lib/supabase/server';
import { containsIdentityClaim, buildSenderValidator, buildAuditEntry, sanitizeText } from '@/lib/security';

function loadGreenApiConfig() {
  const token = process.env.GREENAPI_TOKEN;
  if (!token) return null;
  return {
    baseUrl:   process.env.GREENAPI_BASE_URL || '',
    token,
    groupName: process.env.GREENAPI_GROUP    || 'משרד עורכי דין',
  };
}

// Keywords indicating a bank transfer confirmation in Hebrew
const TRANSFER_KEYWORDS = [
  'העברה', 'זוכה', 'אושר', 'אישור', 'תשלום', 'העברה בנקאית',
  'אישור העברה', '₪', 'שח', 'קיבלנו', 'נכנס',
];

// Keywords that disqualify a message (e.g. "sending" not "received")
const NEGATIVE_KEYWORDS = ['לשלם', 'חשבונית חדשה', 'הוצאה'];

/** Returns true if the message text looks like a bank transfer confirmation */
function isTransferMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw))) return false;
  return TRANSFER_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Extract a numeric amount from the message text */
function extractAmount(text) {
  if (!text) return null;
  const patterns = [
    /(\d[\d,]*\.?\d*)\s*(?:₪|ש["״]?ח)/,
    /(?:₪|ש["״]?ח)\s*(\d[\d,]*\.?\d*)/,
    /סכום[:\s]+(\d[\d,]*\.?\d*)/,
    /(\d[\d,]+)\s*ש/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

/**
 * Match sender to a known client.
 *
 * SECURITY: Phone-number match (from WhatsApp chatId) is VERIFIED — we trust it.
 * Name match inside message text is UNVERIFIED — we flag it but don't auto-trust.
 *
 * The article risk: "I am [client name]" in the message text should NOT be
 * treated as verified identity.
 */
async function findClientMatch(sb, orgId, text, senderPhone) {
  if (!text) return null;
  const { data: clients } = await sb
    .from('clients')
    .select('id, name, phone')
    .eq('organization_id', orgId);

  if (!clients?.length) return null;

  // STEP 1: Match by verified phone number (highest trust)
  if (senderPhone) {
    const { byPhone } = buildSenderValidator(clients);
    const normalized = senderPhone.replace(/\D/g, '');
    // Try full number and last 9/10 digits (Israeli numbers vary with prefix)
    for (const [phone, client] of Object.entries(byPhone)) {
      if (normalized.endsWith(phone.slice(-9)) || phone.endsWith(normalized.slice(-9))) {
        return { ...client, match_type: 'verified_phone' };
      }
    }
  }

  // STEP 2: If message contains identity claim ("אני X", "I am X"), reduce trust
  if (containsIdentityClaim(text)) {
    // Name match from text is allowed but flagged as lower-trust
    const lowerText = text.toLowerCase();
    for (const client of clients) {
      if (client.name && lowerText.includes(client.name.toLowerCase())) {
        return { ...client, match_type: 'unverified_name_claim' };
      }
    }
  }

  // STEP 3: Standard name match — unverified
  const lowerText = text.toLowerCase();
  for (const client of clients) {
    if (client.name && lowerText.includes(client.name.toLowerCase())) {
      return { ...client, match_type: 'text_match' };
    }
  }
  return null;
}

/**
 * Find an invoice for the given client within 60 days.
 * If amount is provided, prefer an invoice whose amount is within ±10%.
 * Falls back to any recent open/unpaid invoice.
 */
async function findMatchingInvoice(sb, orgId, clientId, amount) {
  if (!clientId) return null;

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: invoices } = await sb
    .from('invoices')
    .select('id, amount, number, status')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .gte('issue_date', sixtyDaysAgo)
    .order('issue_date', { ascending: false })
    .limit(10);

  if (!invoices?.length) return null;

  // Prefer an invoice that matches the transfer amount (±10%)
  if (amount) {
    const byAmount = invoices.find((inv) => {
      const diff = Math.abs(inv.amount - amount) / Math.max(amount, 1);
      return diff <= 0.10;
    });
    if (byAmount) return byAmount;
  }

  // Fall back to the most recent unpaid invoice
  return invoices.find((inv) => inv.status !== 'paid') || invoices[0];
}

/**
 * Find invoices that match the amount regardless of client (for unidentified senders).
 * Used to suggest a match when we can't identify the client from the message.
 */
async function findInvoiceByAmount(sb, orgId, amount) {
  if (!amount) return null;

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const low = amount * 0.90;
  const high = amount * 1.10;

  const { data: invoices } = await sb
    .from('invoices')
    .select('id, amount, number, client_name, status')
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .gte('issue_date', sixtyDaysAgo)
    .gte('amount', low)
    .lte('amount', high)
    .order('issue_date', { ascending: false })
    .limit(3);

  return invoices?.[0] || null;
}

export async function runWhatsappScan() {
  const sb = createServiceClient();

  const { data: orgs, error: orgErr } = await sb.from('organizations').select('id');
  if (orgErr || !orgs?.length) {
    return { error: 'No organizations found', scanned: 0, alerts: 0 };
  }
  const orgId = orgs[0].id;

  const cfg = loadGreenApiConfig();
  if (!cfg) {
    return { error: 'GREENAPI_TOKEN env var not set', scanned: 0, alerts: 0 };
  }
  const { baseUrl, token, groupName } = cfg;

  // Step 1: Find the group chat
  let chatId = null;
  try {
    const chatsRes = await fetch(`${baseUrl}/getChats/${token}`);
    if (!chatsRes.ok) throw new Error(`getChats HTTP ${chatsRes.status}`);
    const chats = await chatsRes.json();
    const target = (Array.isArray(chats) ? chats : []).find(
      (c) => c.name && c.name.includes(groupName)
    );
    if (!target) {
      return { error: `Group "${groupName}" not found`, scanned: 0, alerts: 0 };
    }
    chatId = target.id;
  } catch (err) {
    console.error('whatsapp-scan: getChats failed:', err.message);
    return { error: `getChats failed: ${err.message}`, scanned: 0, alerts: 0 };
  }

  // Step 2: Get last 200 messages
  let messages = [];
  try {
    const histRes = await fetch(`${baseUrl}/getChatHistory/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, count: 200 }),
    });
    if (!histRes.ok) throw new Error(`getChatHistory HTTP ${histRes.status}`);
    messages = await histRes.json();
    if (!Array.isArray(messages)) messages = [];
  } catch (err) {
    console.error('whatsapp-scan: getChatHistory failed:', err.message);
    return { error: `getChatHistory failed: ${err.message}`, scanned: 0, alerts: 0 };
  }

  // Step 3: Messages from last 48 hours
  const cutoff = Math.floor(Date.now() / 1000) - 48 * 60 * 60;
  const recent = messages.filter((m) => m.timestamp && m.timestamp >= cutoff);

  // Step 4: Filter for transfer-like messages
  const transfers = recent.filter((m) => {
    const text = m.textMessage || m.caption || '';
    return isTransferMessage(text);
  });

  let alertsCreated = 0;
  let tableExists = true;

  for (const msg of transfers) {
    if (!tableExists) break;

    const text = msg.textMessage || msg.caption || '';
    const amount = extractAmount(text);
    const msgTimestamp = new Date(msg.timestamp * 1000).toISOString();
    const messageId = msg.idMessage || `${msg.chatId}_${msg.timestamp}`;

    // Dedupe
    const { data: existing, error: existErr } = await sb
      .from('whatsapp_alerts')
      .select('id')
      .eq('message_id', messageId)
      .limit(1);
    if (existErr) {
      tableExists = false;
      break;
    }
    if (existing?.length) continue;

    // SECURITY: Extract sender phone from chatId (e.g. "972501234567@c.us")
    const senderPhone = msg.chatId ? msg.chatId.split('@')[0] : null;

    // Match client — phone match is verified, text match is not
    const client = await findClientMatch(sb, orgId, text, senderPhone);
    const isVerifiedSender = client?.match_type === 'verified_phone';

    // Find matching invoice: by client + amount, or by amount alone
    let invoice = null;
    if (client) {
      invoice = await findMatchingInvoice(sb, orgId, client.id, amount);
    }
    if (!invoice && amount) {
      invoice = await findInvoiceByAmount(sb, orgId, amount);
    }

    // SECURITY: Store sanitized message text (strip HTML + limit length)
    const safeText = sanitizeText(text, 1000);

    const alertRow = {
      organization_id: orgId,
      message_id: messageId,
      message_text: safeText,
      message_timestamp: msgTimestamp,
      detected_amount: amount,
      detected_client: client?.name || null,
      client_id: client?.id || null,
      has_invoice: !!invoice,
      invoice_id: invoice?.id || null,
      // SECURITY: Require manual approval for unverified sender matches
      status: isVerifiedSender ? 'pending' : 'needs_verification',
    };

    const { error: insertErr } = await sb.from('whatsapp_alerts').insert(alertRow);
    if (insertErr) {
      console.error('whatsapp-scan: insert error:', insertErr.message);
    } else {
      alertsCreated++;

      // AUDIT: Log the agent decision
      await sb.from('audit_log').insert(buildAuditEntry({
        organizationId: orgId,
        action: 'whatsapp_payment_detected',
        entityType: 'whatsapp_alert',
        sourceChannel: 'whatsapp',
        sourceMessageId: messageId,
        details: {
          amount,
          sender_phone: senderPhone,
          client_name: client?.name,
          match_type: client?.match_type || 'none',
          sender_verified: isVerifiedSender,
          has_invoice: !!invoice,
        },
        approved: isVerifiedSender,
      })).catch((e) => console.warn('audit_log insert failed:', e.message));
    }
  }

  return {
    scanned: recent.length,
    transfers: transfers.length,
    alerts: alertsCreated,
    chatId,
  };
}
