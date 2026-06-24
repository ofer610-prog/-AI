/**
 * Google Calendar integration — two-way sync with the website events table.
 *
 * Uses the same OAuth refresh token stored in organizations.gmail_refresh_token
 * (the user must re-authorize once to grant the calendar scope).
 *
 * Calendar used: 'primary' (the default calendar of the signed-in Google account).
 */

import { google } from 'googleapis';
import { getOAuthClient } from '@/lib/gmail';

const CALENDAR_ID = 'primary';

// ── Auth helper ──────────────────────────────────────────────────────────────
function getCalendarClient(refreshToken) {
  const auth = getOAuthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth });
}

// ── Read Google Calendar events in a time range ──────────────────────────────
export async function fetchGoogleEvents(refreshToken, timeMin, timeMax) {
  const cal = getCalendarClient(refreshToken);
  const res = await cal.events.list({
    calendarId:   CALENDAR_ID,
    timeMin:      timeMin || new Date(Date.now() - 30 * 86400000).toISOString(),
    timeMax:      timeMax || new Date(Date.now() + 90 * 86400000).toISOString(),
    singleEvents: true,
    orderBy:      'startTime',
    maxResults:   500,
  });
  return res.data.items || [];
}

// ── Create an event in Google Calendar ──────────────────────────────────────
export async function createGoogleEvent(refreshToken, event) {
  const cal = getCalendarClient(refreshToken);
  const body = buildGoogleEventBody(event);
  const res  = await cal.events.insert({ calendarId: CALENDAR_ID, requestBody: body });
  return res.data; // { id, htmlLink, ... }
}

// ── Update an existing Google Calendar event ─────────────────────────────────
export async function updateGoogleEvent(refreshToken, googleEventId, event) {
  const cal  = getCalendarClient(refreshToken);
  const body = buildGoogleEventBody(event);
  const res  = await cal.events.update({
    calendarId: CALENDAR_ID,
    eventId:    googleEventId,
    requestBody: body,
  });
  return res.data;
}

// ── Delete a Google Calendar event ───────────────────────────────────────────
export async function deleteGoogleEvent(refreshToken, googleEventId) {
  const cal = getCalendarClient(refreshToken);
  await cal.events.delete({ calendarId: CALENDAR_ID, eventId: googleEventId });
}

// ── Map a Supabase event → Google Calendar event body ────────────────────────
function buildGoogleEventBody(ev) {
  const start = ev.start_time;
  const end   = ev.end_time || new Date(new Date(start).getTime() + 60 * 60000).toISOString();

  const body = {
    summary:     ev.title,
    description: [ev.description, ev.notes, ev.attendee_name && `משתתף: ${ev.attendee_name}`, ev.attendee_phone && `טל׳: ${ev.attendee_phone}`].filter(Boolean).join('\n'),
    location:    ev.location || undefined,
  };

  if (ev.all_day) {
    body.start = { date: start.slice(0, 10) };
    body.end   = { date: (end || start).slice(0, 10) };
  } else {
    body.start = { dateTime: start, timeZone: 'Asia/Jerusalem' };
    body.end   = { dateTime: end,   timeZone: 'Asia/Jerusalem' };
  }

  return body;
}

// ── Map a Google Calendar event → Supabase event fields ─────────────────────
export function mapGoogleToSupabase(gEvent) {
  const isAllDay = !!gEvent.start?.date;
  const start    = isAllDay
    ? gEvent.start.date + 'T00:00:00+02:00'
    : (gEvent.start?.dateTime || gEvent.start?.date);
  const end      = isAllDay
    ? (gEvent.end?.date || gEvent.start.date) + 'T23:59:59+02:00'
    : (gEvent.end?.dateTime || gEvent.end?.date);

  return {
    title:           gEvent.summary || '(ללא כותרת)',
    description:     gEvent.description || null,
    location:        gEvent.location || null,
    start_time:      start,
    end_time:        end,
    all_day:         isAllDay,
    google_event_id: gEvent.id,
    google_calendar_id: CALENDAR_ID,
    event_type:      'meeting',
    status:          gEvent.status === 'cancelled' ? 'cancelled' : 'scheduled',
  };
}

// ── Full sync: Google Calendar → Supabase ───────────────────────────────────
export async function syncGoogleToSupabase(sb, orgId, refreshToken) {
  const gEvents = await fetchGoogleEvents(refreshToken);

  let imported = 0;
  let updated  = 0;
  let skipped  = 0;

  for (const gEvent of gEvents) {
    if (gEvent.status === 'cancelled') {
      // Mark cancelled events in our DB
      await sb.from('events')
        .update({ status: 'cancelled' })
        .eq('organization_id', orgId)
        .eq('google_event_id', gEvent.id);
      continue;
    }

    const fields = mapGoogleToSupabase(gEvent);

    // Check if we already have this event
    const { data: existing } = await sb.from('events')
      .select('id, updated_at')
      .eq('organization_id', orgId)
      .eq('google_event_id', gEvent.id)
      .maybeSingle();

    if (existing) {
      // Only update if Google's version is newer
      const gUpdated = new Date(gEvent.updated || 0);
      const dbUpdated = new Date(existing.updated_at || 0);
      if (gUpdated > dbUpdated) {
        await sb.from('events').update(fields).eq('id', existing.id);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await sb.from('events').insert({
        ...fields,
        organization_id: orgId,
      });
      imported++;
    }
  }

  return { imported, updated, skipped, total: gEvents.length };
}
