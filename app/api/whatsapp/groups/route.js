import { NextResponse } from 'next/server';

const BASE_URL = 'https://7107.api.greenapi.com/waInstance7107631283';
const TOKEN = '574296b4b6384a75a1136693c0a162e31316e872911349d082';

export async function GET() {
  try {
    const res = await fetch(`${BASE_URL}/getChats/${TOKEN}`);
    if (!res.ok) {
      const text = await res.text();
      console.error('GREEN-API getChats error:', res.status, text);
      return NextResponse.json({ error: `GREEN-API error: ${res.status}` }, { status: 502 });
    }
    const chats = await res.json();
    const formatted = (Array.isArray(chats) ? chats : []).map((chat) => ({
      id: chat.id,
      name: chat.name || chat.chatId || '',
    }));
    return NextResponse.json({ chats: formatted, total: formatted.length });
  } catch (err) {
    console.error('whatsapp/groups error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
