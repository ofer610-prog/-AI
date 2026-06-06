import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  // Require authentication
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const instanceId = process.env.GREENAPI_INSTANCE;
  const token      = process.env.GREENAPI_TOKEN;
  if (!instanceId || !token) {
    return NextResponse.json({ error: 'GREEN-API not configured' }, { status: 503 });
  }
  const BASE_URL = `https://7107.api.greenapi.com/waInstance${instanceId}`;

  try {
    const res = await fetch(`${BASE_URL}/getChats/${token}`);
    if (!res.ok) {
      const text = await res.text();
      console.error('GREEN-API getChats error:', res.status, text);
      return NextResponse.json({ error: `GREEN-API error: ${res.status}` }, { status: 502 });
    }
    const chats     = await res.json();
    const formatted = (Array.isArray(chats) ? chats : []).map((chat) => ({
      id:   chat.id,
      name: chat.name || chat.chatId || '',
    }));
    return NextResponse.json({ chats: formatted, total: formatted.length });
  } catch (err) {
    console.error('whatsapp/groups error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
