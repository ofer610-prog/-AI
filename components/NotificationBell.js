'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const fmtTime = (d) => new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const KIND_ICON = { task: '📋', invoice: '🧾', collection: '💰', system: '⚙️', ai: '🤖' };

/**
 * Global notification bell.
 * - Polls /api/notifications every 30s
 * - Fires a desktop (browser) notification for anything new
 * - Task notifications carry a "קיבלתי, בטיפול" button that acks the task
 */
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.status === 401) { setLoggedIn(false); return; }
      if (!res.ok) return;
      const data = await res.json();
      const list = data.notifications || [];

      // Desktop notification for anything we haven't shown yet (skip initial load)
      if (!firstLoad.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const n of list) {
          if (n.status === 'new' && !seenIds.current.has(n.id)) {
            try { new Notification(n.title, { body: n.body || '', tag: n.id }); } catch {}
          }
        }
      }
      list.forEach((n) => seenIds.current.add(n.id));
      firstLoad.current = false;

      setItems(list);
      setUnread(data.unread || 0);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const requestPermission = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const ack = async (n) => {
    setItems((p) => p.map((x) => x.id === n.id ? { ...x, status: 'ack' } : x));
    setUnread((u) => Math.max(0, u - (n.status === 'new' ? 1 : 0)));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id, status: 'ack' }),
    }).catch(() => {});
  };

  const markAllSeen = async () => {
    setItems((p) => p.map((x) => x.status === 'new' ? { ...x, status: 'seen' } : x));
    setUnread(0);
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, status: 'seen' }),
    }).catch(() => {});
  };

  if (!loggedIn) return null;

  return (
    <div dir="rtl" className="fixed bottom-5 left-5 z-[100]">
      {/* Panel */}
      {open && (
        <div className="absolute bottom-14 left-0 w-96 max-w-[92vw] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-800 text-white flex items-center justify-between">
            <span className="font-bold text-sm">🔔 התראות</span>
            {unread > 0 && (
              <button onClick={markAllSeen} className="text-xs text-slate-300 hover:text-white">
                סמן הכל כנקרא
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">אין התראות</div>
            )}
            {items.map((n) => (
              <div key={n.id} className={`px-4 py-3 ${n.status === 'new' ? 'bg-blue-50/70' : 'bg-white'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5">{KIND_ICON[n.kind] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{n.title}</div>
                    {n.body && <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{n.body}</div>}
                    <div className="text-[11px] text-slate-400 mt-1">{fmtTime(n.created_at)}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  {n.kind === 'task' && n.status !== 'ack' && (
                    <button onClick={() => ack(n)}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg">
                      ✅ קיבלתי, בטיפול
                    </button>
                  )}
                  {n.status === 'ack' && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">✓ בטיפול</span>
                  )}
                  {n.link && (
                    <a href={n.link} className="text-xs text-blue-600 hover:underline px-2 py-1">פתח ←</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bell button */}
      <button
        onClick={() => { setOpen((o) => !o); requestPermission(); }}
        className="relative w-12 h-12 rounded-full bg-slate-800 text-white shadow-xl hover:bg-slate-700 flex items-center justify-center text-xl"
        title="התראות">
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
