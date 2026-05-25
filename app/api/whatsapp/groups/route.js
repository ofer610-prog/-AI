import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const sb = createServiceClient();
    const { data: orgs } = await sb.from('organizations').select('id').limit(1);
    if (!orgs?.length) {
      return NextResponse.json({ error: 'No organization' }, { status: 500 });
    }
    let instance_id, api_url, token;
    if (process.env.GREENAPI_API_URL && process.env.GREENAPI_INSTANCE_ID && process.env.GREENAPI_TOKEN) {
      instance_id = process.env.GREENAPI_INSTANCE_ID;
      api_url = process.env.GREENAPI_API_URL;
      token = process.env.GREENAPI_TOKEN;
    } else {
      const { data: setting } = await sb
        .from('integration_settings')
        .select('config')
        .eq('organization_id', orgs[0].id)
        .eq('provider', 'greenapi')
        .maybeSingle();
      if (!setting?.config?.token) {
        return NextResponse.json({ error: 'GREEN-API not configured' }, { status: 500 });
      }
      ({ instance_id, api_url, token } = setting.config);
    }
    const baseUrl = `${api_url}/waInstance${instance_id}`;

    const res = await fetch(`${baseUrl}/getChats/${token}`);
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
