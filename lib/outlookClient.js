/**
 * Microsoft Outlook / Graph API OAuth helper
 * Mirrors lib/gmail.js but for Microsoft identity platform.
 *
 * Required env vars:
 *   MICROSOFT_CLIENT_ID      — Azure app registration client ID
 *   MICROSOFT_CLIENT_SECRET  — Azure app registration client secret
 *   MICROSOFT_REDIRECT_URI   — e.g. https://your-app.vercel.app/api/auth/outlook/callback
 */

const TENANT = 'common'; // allows personal + work accounts (Hotmail, Outlook.com, O365)
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const SCOPES = [
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/User.Read',
].join(' ');

// ── OAuth URLs ────────────────────────────────────────────────────────────────

export function getOutlookAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    scope: SCOPES,
    response_mode: 'query',
    state,
    // prompt: 'consent' forces refresh_token to be issued even for returning users
    prompt: 'consent',
    access_type: 'offline',
  });
  return `${AUTH_BASE}/authorize?${params}`;
}

// ── Token exchange ─────────────────────────────────────────────────────────────

export async function exchangeOutlookCode(code) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
      grant_type: 'authorization_code',
      code,
      scope: SCOPES,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

// ── Refresh access token ───────────────────────────────────────────────────────

export async function refreshOutlookToken(refreshToken) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return res.json(); // { access_token, refresh_token?, expires_in }
}

// ── Graph API helpers ─────────────────────────────────────────────────────────

async function graphGet(accessToken, path, params = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function getOutlookUserEmail(accessToken) {
  const me = await graphGet(accessToken, '/me', { $select: 'mail,userPrincipalName' });
  return me.mail || me.userPrincipalName || null;
}

/**
 * Search for emails matching a filter string using Graph API.
 * Returns array of message objects.
 * @param {string} accessToken
 * @param {string} filter  — OData $filter expression
 * @param {number} top     — max results per page
 */
export async function searchOutlookMessages(accessToken, filter, top = 50) {
  const messages = [];
  let url = `${GRAPH_BASE}/me/messages`;
  const params = {
    $top: String(top),
    $select: 'id,subject,from,receivedDateTime,body,hasAttachments,attachments',
    $expand: 'attachments($select=id,name,contentType,size)',
  };
  if (filter) params['$filter'] = filter;

  // Fetch up to 3 pages (150 messages max per call site)
  for (let page = 0; page < 3; page++) {
    const fullUrl = new URL(url);
    if (page === 0) Object.entries(params).forEach(([k, v]) => fullUrl.searchParams.set(k, v));

    const res = await fetch(fullUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    messages.push(...(data.value || []));
    if (!data['@odata.nextLink']) break;
    url = data['@odata.nextLink'];
  }
  return messages;
}

/**
 * Download an attachment's bytes.
 */
export async function getOutlookAttachment(accessToken, messageId, attachmentId) {
  const data = await graphGet(accessToken, `/me/messages/${messageId}/attachments/${attachmentId}`);
  return data.contentBytes ? Buffer.from(data.contentBytes, 'base64') : null;
}
