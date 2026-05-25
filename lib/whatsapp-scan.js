import { createServiceClient } from '@/lib/supabase/server';

async function loadGreenApiConfig(sb, orgId) {
  // 1. Try env vars first
  if (process.env.GREENAPI_API_URL && process.env.GREENAPI_INSTANCE_ID && process.env.GREENAPI_TOKEN) {
    return {
      baseUrl: `${process.env.GREENAPI_API_URL}/waInstance${process.env.GREENAPI_INSTANCE_ID}`,
      token: process.env.GREENAPI_TOKEN,
      groupName: process.env.GREENAPI_GROUP_NAME || 'משרד עורכי דין',
    };
  }
  // 2. Fallback to DB settings
  const { data } = await sb
    .from('integration_settings')
    .select('config')
    .eq('organization_id', orgId)
    .eq('provider', 'greenapi')
    .eq('is_active', true)
    .maybeSingle();
  if (!data?.config) return null;
  const { instance_id, api_url, token, target_group_name } = data.config;
  if (!instance_id || !api_url || !token) return null;
  return {
    baseUrl: `${api_url}/waInstance${instance_id}`,
    token,
    groupName: target_group_name || 'משרד עורכי דין',
  };
}

const TRANSFER_KEYWORDS = ['העברה', 'זוכה', 'אושר', 'תשלום', 'העברה בנקאית', 'אישור העברה', '₪', 'שח'];

/** Returns true if the message text looks like a bank transfer confirmation */
function isTransferMessage(text) {
  if (!text) return false;
  return TRANSFER_KEYWORDS.some((kw) => text.includes(kw));
}

/** Extract a numeric amount from the message text */
function extractAmount(text) {
  if (!text) return null;
  // e.g. "1,234.50 ₪" or "₪1234" or "1234 ש\"ח" or "1,234 שח"
  const patterns = [
    /(\d[\d,]*\.?\d*)\s*(?:₪|ש["״]?ח)/,
    /(?:₪|ש["״]?ח)\s*(\d[\d,]*\.?\d*)/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

/** Try to match message text against known client names in DB */
async function findClientMatch(sb, orgId, text) {
  if (!text) return null;
  const { data: clients } = await sb
    .from('clients')
    .select('id, name')
    .eq('organization_id', orgId);

  if (!clients?.length) return null;

  const lowerText = text.toLowerCase();
  for (const client of clients) {
    if (client.name && lowerText.includes(client.name.toLowerCase())) {
      return client;
    }
  }
  return null;
}

/** Check if there's a recent invoice (last 7 days) for the given client */
async function findRecentInvoice(sb, orgId, clientId) {
  if (!clientId) return null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invoices } = await sb
    .from('invoices')
    .select('id, amount, invoice_number')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .gte('created_at', sevenDaysAgo)
    .limit(1);

  return invoices?.[0] || null;
}

export async function runWhatsappScan() {
  const sb = createServiceClient();

  // Get org ID
  const { data: orgs, error: orgErr } = await sb.from('organizations').select('id');
  if (orgErr || !orgs?.length) {
    return { error: 'No organizations found', scanned: 0, alerts: 0 };
  }
  const orgId = orgs[0].id;

  const cfg = await loadGreenApiConfig(sb, orgId);
  if (!cfg) {
    return { error: 'GREEN-API not configured. Run /api/admin/setup-whatsapp first.', scanned: 0, alerts: 0 };
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

  // Step 3: Filter messages from last 48 hours
  const cutoff = Math.floor(Date.now() / 1000) - 48 * 60 * 60;
  const recent = messages.filter((m) => m.timestamp && m.timestamp >= cutoff);

  // Step 4: Filter for transfer-like messages
  const transfers = recent.filter((m) => {
    const text = m.textMessage || m.caption || '';
    return isTransferMessage(text);
  });

  let alertsCreated = 0;

  for (const msg of transfers) {
    const text = msg.textMessage || msg.caption || '';
    const amount = extractAmount(text);
    const msgTimestamp = new Date(msg.timestamp * 1000).toISOString();
    const messageId = msg.idMessage || `${msg.chatId}_${msg.timestamp}`;

    // Check if already stored
    const { data: existing } = await sb
      .from('whatsapp_alerts')
      .select('id')
      .eq('message_id', messageId)
      .limit(1);
    if (existing?.length) continue;

    // Try to match client
    const client = await findClientMatch(sb, orgId, text);
    const invoice = client ? await findRecentInvoice(sb, orgId, client.id) : null;

    const alertRow = {
      organization_id: orgId,
      message_id: messageId,
      message_text: text,
      message_timestamp: msgTimestamp,
      detected_amount: amount,
      detected_client: client?.name || null,
      client_id: client?.id || null,
      has_invoice: !!invoice,
      invoice_id: invoice?.id || null,
      status: 'pending',
    };

    const { error: insertErr } = await sb.from('whatsapp_alerts').insert(alertRow);
    if (insertErr) {
      console.error('whatsapp-scan: insert alert error:', insertErr.message);
    } else {
      alertsCreated++;
    }
  }

  return {
    scanned: recent.length,
    transfers: transfers.length,
    alerts: alertsCreated,
    chatId,
  };
}
