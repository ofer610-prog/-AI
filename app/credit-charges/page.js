'use client';
import { useState, useEffect } from 'react';

const money = n => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL') : '—';

const STATUS_LABEL = {
  pending: { label: '⚠️ חסרה חשבונית', cls: 'bg-red-100 text-red-800' },
  matched: { label: '✅ יש חשבונית', cls: 'bg-green-100 text-green-800' },
  dismissed: { label: 'בוטל', cls: 'bg-gray-100 text-gray-500' },
};

export default function CreditChargesPage() {
  const [smsText, setSmsText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');

  const loadCharges = async (status = filterStatus) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/credit-charges/list?status=${status}`);
      const data = await res.json();
      setCharges(data.charges || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadCharges(); }, []);

  const handleParse = async () => {
    if (!smsText.trim()) return;
    setParsing(true);
    setParseError('');
    setParseResult(null);
    try {
      const res = await fetch('/api/credit-charges/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sms: smsText }),
      });
      const data = await res.json();
      if (!res.ok) { setParseError(data.error || 'שגיאה'); }
      else { setParseResult(data); setSmsText(''); loadCharges(); }
    } catch { setParseError('שגיאת רשת'); }
    setParsing(false);
  };

  const dismiss = async (id) => {
    await fetch('/api/credit-charges/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alert_status: 'dismissed' }),
    });
    loadCharges();
  };

  const pendingCount = charges.filter(c => c.alert_status === 'pending').length;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">💳 חיובי אשראי</h1>
            <p className="text-sm text-gray-500">הדבק SMS → בדיקת חשבונית אוטומטית</p>
          </div>
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
              {pendingCount} חסרים
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* SMS Input */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="font-semibold text-gray-800 mb-2">📱 הדבק SMS מהאשראי</h2>
          <p className="text-xs text-gray-500 mb-3">
            קבלת SMS על חיוב? העתק את ההודעה מכל חברת אשראי (ישראכרט, Max, Visa Cal, Amex) והדבק כאן
          </p>
          <textarea
            value={smsText}
            onChange={e => setSmsText(e.target.value)}
            placeholder={`לדוגמה:\nחויבת ב-345.00 ₪ ב-SPOTIFY T.LAviv בתאריך 14/06/26 כרטיס מסתיים ב-9434\n\nאפשר להדביק כמה הודעות ביחד`}
            rows={5}
            className="w-full border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {parseError && (
            <p className="text-red-600 text-sm mt-2">❌ {parseError}</p>
          )}
          <button
            onClick={handleParse}
            disabled={parsing || !smsText.trim()}
            className="mt-3 w-full bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
          >
            {parsing ? '⏳ מנתח...' : '🔍 נתח וזהה חיוב'}
          </button>
        </div>

        {/* Parse Result */}
        {parseResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <h3 className="font-semibold text-green-800 mb-2">✅ זוהו {parseResult.count} חיובים</h3>
            {parseResult.parsed.map((p, i) => (
              <div key={i} className="bg-white rounded-lg p-3 mb-2 border border-green-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">{money(p.amount)}</p>
                    <p className="text-sm text-gray-600">{p.vendor}</p>
                    <p className="text-xs text-gray-400">{fmtDate(p.charge_date)} {p.card_last4 && `• *${p.card_last4}`}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${p.matched ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {p.matched ? '✅ יש חשבונית' : '⚠️ חסרה חשבונית'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2">
          {['pending', 'matched', 'dismissed'].map(s => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); loadCharges(s); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {s === 'pending' ? '⚠️ חסרים' : s === 'matched' ? '✅ תואמים' : '🚫 בוטלו'}
            </button>
          ))}
        </div>

        {/* Charges List */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">טוען...</div>
        ) : charges.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {filterStatus === 'pending' ? (
              <>
                <p className="text-4xl mb-2">✅</p>
                <p>כל החיובים תועדו!</p>
              </>
            ) : (
              <p>אין חיובים להצגה</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {charges.map(c => (
              <div key={c.id} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-lg">{money(c.amount)}</p>
                    <p className="text-gray-700 text-sm">{c.vendor}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {fmtDate(c.charge_date)}
                      {c.card_last4 && ` • כרטיס *${c.card_last4}`}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${STATUS_LABEL[c.alert_status]?.cls || ''}`}>
                    {STATUS_LABEL[c.alert_status]?.label}
                  </span>
                </div>

                {c.expense_documents && (
                  <div className="bg-green-50 rounded-lg p-2 text-xs text-green-700 mb-2">
                    📄 חשבונית: {c.expense_documents.vendor} — {money(c.expense_documents.amount || 0)}
                    {c.expense_documents.file_url && (
                      <a href={c.expense_documents.file_url} target="_blank" rel="noreferrer" className="mr-2 underline">פתח</a>
                    )}
                  </div>
                )}

                {c.alert_status === 'pending' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => dismiss(c.id)}
                      className="flex-1 text-xs py-2 rounded-lg border border-gray-300 text-gray-600 active:bg-gray-100"
                    >
                      בטל התראה
                    </button>
                    <a
                      href="/expenses"
                      className="flex-1 text-xs py-2 rounded-lg bg-blue-600 text-white text-center active:bg-blue-700"
                    >
                      העלה חשבונית
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
