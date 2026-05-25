import { NextResponse } from 'next/server';

const BASE_URL = process.env.GREENAPI_API_URL
  ? `${process.env.GREENAPI_API_URL}/waInstance${process.env.GREENAPI_INSTANCE_ID}`
  : null;
const TOKEN = process.env.GREENAPI_TOKEN;

export async function GET() {
  try {
    if (!BASE_URL || !TOKEN) {
      return NextResponse.json({ error: 'GREEN-API env vars not configured' }, { status: 500 });
    }

    const res = await fetch(`${BASE_URL}/getChats/${TOKEN}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('GREEN-API getChats error:', res.status, text);
      return NextResponse.json({ error: `GREEN-API error: ${res.status}` }, { status: 502 });
    }

    const chats = await res.json();

    const formatted = (Array.isArray(chats) ? chats : []).map((chat) => ({
      id: chat.id,
      name: chat.name || chat.chatId || '',
      lastMessage: chat.lastMessage?.textMessage || chat.lastMessage?.caption || '',
      timestamp: chat.lastMessage?.timestamp,
    }));

    return NextResponse.json({ chats: formatted, total: formatted.length });
  } catch (err) {
    console.error('whatsapp/groups error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
