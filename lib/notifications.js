/**
 * Shared notification helpers — WhatsApp (Green API) + Email (Resend)
 */

// Green API credentials — set GREENAPI_BASE_URL and GREENAPI_TOKEN in env vars,
// or they fall back to the values configured in lib/whatsapp-scan.js (same instance).
const GREEN_API_BASE  = process.env.GREENAPI_BASE_URL  || '';
const GREEN_API_TOKEN = process.env.GREENAPI_TOKEN     || '';
const OFFICE_GROUP    = process.env.GREENAPI_GROUP     || 'משרד עורכי דין';

const fmtMoney = (n) => `₪${Number(n || 0).toLocaleString('he-IL')}`;
const fmt = (d) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

// ─── WhatsApp ────────────────────────────────────────────────────────────────

/** Whether WhatsApp sending is configured (token + base URL present) */
export function isWhatsappEnabled() {
  return Boolean(GREEN_API_TOKEN && GREEN_API_BASE);
}

/** Send a WhatsApp message to a specific phone number (e.g. "972501234567") */
export async function sendWhatsappToPhone(phone, message) {
  if (!isWhatsappEnabled()) return false;
  const chatId = phone.replace(/[^0-9]/g, '') + '@c.us';
  return _waSend(chatId, message);
}

/** Send a WhatsApp message to the office group */
export async function sendWhatsappToOffice(message) {
  if (!isWhatsappEnabled()) return false;
  // Find office group chat ID
  try {
    const chatsRes = await fetch(`${GREEN_API_BASE}/getChats/${GREEN_API_TOKEN}`);
    if (!chatsRes.ok) throw new Error(`getChats HTTP ${chatsRes.status}`);
    const chats = await chatsRes.json();
    const group = (Array.isArray(chats) ? chats : []).find(
      (c) => c.name && c.name.includes(OFFICE_GROUP)
    );
    if (!group) { console.warn('Office WhatsApp group not found'); return false; }
    return _waSend(group.id, message);
  } catch (err) {
    console.error('sendWhatsappToOffice error:', err.message);
    return false;
  }
}

async function _waSend(chatId, message) {
  try {
    const res = await fetch(`${GREEN_API_BASE}/sendMessage/${GREEN_API_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    });
    return res.ok;
  } catch (err) {
    console.error('_waSend error:', err.message);
    return false;
  }
}

// ─── Email (Resend) ──────────────────────────────────────────────────────────

export async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email skipped');
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const { error } = await resend.emails.send({ from: `משרד עורכי דין <${from}>`, to, subject, html });
    if (error) { console.error('Resend error:', error); return false; }
    return true;
  } catch (err) {
    console.error('sendEmail error:', err.message);
    return false;
  }
}

// ─── Message builders ────────────────────────────────────────────────────────

/** WhatsApp message for office alert: new bank credit without invoice */
export function buildBankAlertMessage({ amount, description, date, draftInvoiceNumber }) {
  return [
    `💰 *הכנסה חדשה ללא חשבונית*`,
    ``,
    `סכום: *${fmtMoney(amount)}*`,
    `תיאור: ${description || '(ללא תיאור)'}`,
    `תאריך: ${fmt(date)}`,
    ``,
    draftInvoiceNumber
      ? `⚠️ נוצרה טיוטת חשבונית *#${draftInvoiceNumber}* — ממתינה לאישורך במערכת.`
      : `⚠️ לא נמצאה חשבונית מתאימה — יש לטפל במערכת.`,
  ].join('\n');
}

/** WhatsApp message to send an invoice to a client */
export function buildInvoiceClientMessage({ clientName, invoiceNumber, amount, issueDate, dueDate, officeName }) {
  return [
    `שלום ${clientName},`,
    ``,
    `מצורפים פרטי החשבונית שלך:`,
    ``,
    `📄 *חשבונית מס׳ ${invoiceNumber}*`,
    `סכום: *${fmtMoney(amount)}*`,
    `תאריך הפקה: ${fmt(issueDate)}`,
    `תאריך פירעון: ${fmt(dueDate)}`,
    ``,
    `לתשלום ולשאלות — אנא צרו קשר עמנו.`,
    ``,
    `בברכה,`,
    `${officeName || 'משרד עורכי דין'}`,
  ].join('\n');
}

/** HTML email body for sending an invoice to a client */
export function buildInvoiceEmailHtml({ clientName, invoiceNumber, amount, issueDate, dueDate, notes, officeName }) {
  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#1c1917;">
  <h2 style="color:#1e40af;border-bottom:2px solid #bfdbfe;padding-bottom:8px;">
    חשבונית מס׳ ${invoiceNumber}
  </h2>
  <p>שלום ${clientName},</p>
  <p>להלן פרטי החשבונית:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr style="background:#f1f5f9;">
      <td style="padding:8px 12px;font-weight:bold;">מספר חשבונית</td>
      <td style="padding:8px 12px;">${invoiceNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;font-weight:bold;">סכום לתשלום</td>
      <td style="padding:8px 12px;font-size:18px;font-weight:bold;color:#15803d;">${fmtMoney(amount)}</td>
    </tr>
    <tr style="background:#f1f5f9;">
      <td style="padding:8px 12px;font-weight:bold;">תאריך הפקה</td>
      <td style="padding:8px 12px;">${fmt(issueDate)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;font-weight:bold;">תאריך פירעון</td>
      <td style="padding:8px 12px;color:#dc2626;font-weight:bold;">${fmt(dueDate)}</td>
    </tr>
    ${notes ? `<tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:bold;">הערות</td><td style="padding:8px 12px;">${notes}</td></tr>` : ''}
  </table>
  <p style="color:#6b7280;font-size:13px;">לתשלום ולשאלות, אנא צרו קשר עם המשרד.</p>
  <p>בברכה,<br/><strong>${officeName || 'משרד עורכי דין'}</strong></p>
</div>`;
}
