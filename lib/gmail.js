import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// Gmail OAuth client
// ============================================================================
export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify', // for adding labels
];

export function getAuthUrl() {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent', // forces refresh_token
  });
}

export async function exchangeCodeForTokens(code) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export function getGmailClient(refreshToken) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// ============================================================================
// Email classification & extraction prompts (for Claude)
// ============================================================================
const CLASSIFICATION_PROMPT = `אתה עוזר לעו"ד נדל"ן בישראל לסווג מיילים ולחלץ מהם נתונים פיננסיים.

מתוך המייל הבא, החזר JSON בלבד (ללא markdown, ללא הסבר) במבנה:
{
  "classification": "bank-notification" | "bit-payment" | "invoice" | "transfer-confirmation" | "whatsapp-export" | "client-payment" | "other",
  "is_relevant": true/false,
  "amount": <number או null>,
  "date": "YYYY-MM-DD" או null,
  "description": "תיאור קצר במשפט אחד",
  "from_party": "מי שולח/משלם",
  "to_party": "מי מקבל",
  "direction": "income" | "expense" | "neutral",
  "confidence": "high" | "medium" | "low",
  "reasoning": "הסבר קצר למה סיווגת ככה"
}

הנחיות סיווג:
- bank-notification: התראה מהבנק על תנועה בחשבון
- bit-payment: אישור תשלום או קבלה מאפליקציית ביט
- invoice: חשבונית או קבלה מספק (ההוצאה כלולה במייל או בצרופה)
- transfer-confirmation: אישור העברה בנקאית רגילה
- whatsapp-export: ייצוא צ'אט מווטסאפ (subject/body כולל "WhatsApp Chat")
- client-payment: לקוח שמודיע על תשלום ששלח
- other: כל דבר אחר

is_relevant = false אם זה לא קשור לכספים (פרסומות, ניוזלטרים, מיילים אישיים וכו').

החזר JSON תקין בלבד.`;

// ============================================================================
// Search Gmail for relevant emails since a date
// ============================================================================
export async function searchRelevantEmails(gmail, sinceDate) {
  // Search query: emails from last 24h that might be financial
  const query = [
    `after:${Math.floor(sinceDate.getTime() / 1000)}`,
    '-label:processed-by-bookkeeping', // skip already processed
    '(' + [
      'from:(bank OR bnhp OR leumi OR mizrahi OR discount OR poalim OR hapoalim OR otzar)',
      'subject:(העברה OR חשבונית OR קבלה OR תשלום OR ביט OR bit OR transfer OR payment OR invoice OR receipt)',
      'from:(noreply OR notifications)',
      'has:attachment filename:(pdf OR jpg OR jpeg OR png)',
      'subject:"WhatsApp Chat"',
    ].join(' OR ') + ')',
  ].join(' ');

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 100,
  });

  return res.data.messages || [];
}

// ============================================================================
// Get full email content + attachments
// ============================================================================
export async function getEmailDetails(gmail, messageId) {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const message = res.data;
  const headers = message.payload.headers;
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const from = headers.find(h => h.name === 'From')?.value || '';
  const date = headers.find(h => h.name === 'Date')?.value || '';

  // Extract body
  let body = '';
  const extractBody = (part) => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
      const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      body += html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); // crude HTML strip
    }
    if (part.parts) part.parts.forEach(extractBody);
  };
  extractBody(message.payload);

  // Find attachments
  const attachments = [];
  const collectAttachments = (part) => {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) part.parts.forEach(collectAttachments);
  };
  collectAttachments(message.payload);

  return {
    id: messageId,
    subject,
    from,
    date,
    body: body.slice(0, 10000), // cap at 10k chars
    attachments,
  };
}

export async function getAttachmentData(gmail, messageId, attachmentId) {
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  return res.data.data; // base64
}

// ============================================================================
// Classify email with Gemini
// ============================================================================
export async function classifyEmail(emailDetails) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const parts = [];

  // If there's an image attachment, include it for vision
  if (emailDetails.firstImageData) {
    parts.push({
      inlineData: {
        mimeType: emailDetails.firstImageMimeType,
        data: emailDetails.firstImageData,
      },
    });
  }

  parts.push({
    text: `${CLASSIFICATION_PROMPT}\n\nFROM: ${emailDetails.from}\nSUBJECT: ${emailDetails.subject}\nDATE: ${emailDetails.date}\n\nBODY:\n${emailDetails.body}`,
  });

  const result = await model.generateContent(parts);
  const text = result.response.text().replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    return { classification: 'other', is_relevant: false, confidence: 'low', reasoning: 'parse error' };
  }
}

// ============================================================================
// Mark email as processed (apply Gmail label)
// ============================================================================
export async function ensureProcessedLabel(gmail) {
  const labelsRes = await gmail.users.labels.list({ userId: 'me' });
  const existing = labelsRes.data.labels?.find(l => l.name === 'processed-by-bookkeeping');
  if (existing) return existing.id;

  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name: 'processed-by-bookkeeping' },
  });
  return created.data.id;
}

export async function markAsProcessed(gmail, messageId, labelId) {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [labelId] },
  });
}
