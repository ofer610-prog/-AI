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

/** WhatsApp message for office alert: new bank credit, draft being created in Cligal */
export function buildBankAlertMessage({ amount, description, date }) {
  return [
    `💰 *הכנסה חדשה ללא חשבונית*`,
    ``,
    `סכום: *${fmtMoney(amount)}*`,
    `תיאור: ${description || '(ללא תיאור)'}`,
    `תאריך: ${fmt(date)}`,
    ``,
    `📝 טיוטת חשבונית נוצרת כעת בקליגל — יש לאשר ולשלוח ללקוח.`,
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

// ─── Daily briefing / secretary messages ────────────────────────────────────

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : '—';

/**
 * Morning briefing sent to the office group every day at ~08:00.
 * Includes today's events, overdue invoices, open balance summary.
 */
export function buildMorningBriefing({ officeName, todayEvents, overdueInvoices, openInvoicesTotal, openInvoicesCount, unmatchedCredits, paymentsThisWeek }) {
  const now  = new Date();
  const day  = DAYS_HE[now.getDay()];
  const date = now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

  const lines = [
    `🌅 *בוקר טוב, ${officeName || 'משרד עורכי דין'}!*`,
    `📅 יום ${day}, ${date}`,
    ``,
  ];

  // Today's schedule
  if (todayEvents?.length) {
    lines.push(`📋 *לוז היום:*`);
    for (const ev of todayEvents) {
      const timeStr = ev.all_day ? 'כל היום' : `${fmtTime(ev.start_time)}–${fmtTime(ev.end_time)}`;
      const who = ev.attendee_name || ev.client_name || '';
      lines.push(`  ⏰ ${timeStr} — ${ev.title}${who ? ` עם ${who}` : ''}${ev.attendee_phone ? `\n       📞 ${ev.attendee_phone}` : ''}`);
    }
    lines.push(``);
  } else {
    lines.push(`📋 *אין פגישות היום*`, ``);
  }

  // Financial snapshot
  lines.push(`💼 *מצב כספי:*`);
  if (overdueInvoices?.length) {
    lines.push(`  🔴 *${overdueInvoices.length} חשבוניות באיחור* — ${fmtMoney(overdueInvoices.reduce((s, i) => s + Number(i.amount), 0))}`);
    for (const inv of overdueInvoices.slice(0, 3)) {
      lines.push(`     • ${inv.client_name} — ${fmtMoney(inv.amount)} (פירעון ${fmtDate(inv.due_date)})`);
    }
    if (overdueInvoices.length > 3) lines.push(`     ... ועוד ${overdueInvoices.length - 3}`);
  } else {
    lines.push(`  ✅ אין חשבוניות באיחור`);
  }
  if (openInvoicesCount > 0) {
    lines.push(`  📄 ${openInvoicesCount} חשבוניות פתוחות — ${fmtMoney(openInvoicesTotal)}`);
  }
  if (unmatchedCredits > 0) {
    lines.push(`  ⚠️ ${unmatchedCredits} הכנסות בנק ממתינות לחשבונית`);
  }
  if (paymentsThisWeek > 0) {
    lines.push(`  💚 תשלומים השבוע: ${fmtMoney(paymentsThisWeek)}`);
  }

  return lines.join('\n');
}

/**
 * Evening summary sent at ~19:00.
 */
export function buildEveningSummary({ officeName, completedEvents, paymentsToday, newClients }) {
  const now  = new Date();
  const day  = DAYS_HE[now.getDay()];
  const date = now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });

  const lines = [
    `🌙 *סיכום יום ${day}, ${date}*`,
    `${officeName || 'משרד עורכי דין'}`,
    ``,
  ];

  if (completedEvents?.length) {
    lines.push(`✅ *התקיים היום:*`);
    for (const ev of completedEvents) {
      const timeStr = ev.all_day ? '' : `${fmtTime(ev.start_time)} `;
      lines.push(`  ✓ ${timeStr}${ev.title}${ev.attendee_name ? ` — ${ev.attendee_name}` : ''}`);
    }
    lines.push(``);
  }

  if (paymentsToday > 0) {
    lines.push(`💰 *תשלומים שהתקבלו היום:* ${fmtMoney(paymentsToday)}`);
  }
  if (newClients > 0) {
    lines.push(`👤 לקוחות חדשים היום: ${newClients}`);
  }
  if (!completedEvents?.length && !paymentsToday) {
    lines.push(`לילה טוב 🌙`);
  }

  return lines.join('\n');
}

/**
 * Invoice overdue reminder sent to the office (not to the client).
 */
export function buildOverdueReminderMessage({ invoices }) {
  const total = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const lines = [
    `⚠️ *תזכורת: חשבוניות שלא שולמו*`,
    ``,
    `סה"כ: *${fmtMoney(total)}*`,
    ``,
  ];
  for (const inv of invoices) {
    const daysLate = Math.floor((Date.now() - new Date(inv.due_date)) / 86400000);
    lines.push(`📋 ${inv.client_name} — ${fmtMoney(inv.amount)}`);
    lines.push(`   פירעון: ${fmt(inv.due_date)} (${daysLate} ימים באיחור)`);
    if (inv.number) lines.push(`   חשבונית #${inv.number}`);
    lines.push(``);
  }
  return lines.join('\n').trimEnd();
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
