'use client';

import { useMemo, useRef, useState } from 'react';

const BANKS = {
  mizrahi: { label: 'מזרחי טפחות', icon: '🔴' },
  hapoalim: { label: 'בנק הפועלים', icon: '🏦' },
};

const money = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

function StatusBadge({ status, type }) {
  if (status === 'matched') return <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">תואם {type === 'income' ? 'הכנסה' : 'הוצאה'}</span>;
  if (status === 'possible_gap') return <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">פער לבדיקה</span>;
  return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">אין חשבונית תואמת</span>;
}

function AttentionNotes({ notes }) {
  if (!notes?.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="space-y-1 min-w-[220px]">
      {notes.map((n, i) => (
        <div key={i} className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-bold text-amber-800">
          ⚠️ {n}
        </div>
      ))}
    </div>
  );
}

function ManualDecision({ row, decision, onChange }) {
  const value = decision?.type || '';
  return (
    <div className="space-y-2 min-w-[260px]">
      <select
        value={value}
        onChange={e => onChange(row.id, { ...decision, type: e.target.value })}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold"
      >
        <option value="">בחר טיפול ידני</option>
        <option value="expense_existing_invoice">הוצאה שיש לה חשבונית במערכת</option>
        <option value="expense_missing_invoice">הוצאה — חסרה חשבונית</option>
        <option value="income_client_invoice_needed">הכנסה מלקוח — צריך חשבונית מס</option>
        <option value="income_existing_invoice">הכנסה — יש חשבונית מס במערכת</option>
        <option value="not_relevant">לא רלוונטי להנה״ח</option>
        <option value="needs_review">דורש בדיקה נוספת</option>
      </select>
      <input
        value={decision?.note || ''}
        onChange={e => onChange(row.id, { ...decision, note: e.target.value })}
        placeholder="הערה ידנית / שם לקוח / מס׳ חשבונית"
        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
      />
      {value && (
        <div className="rounded-lg bg-sky-50 border border-sky-200 px-2 py-1 text-[11px] text-sky-800">
          ההחלטה נשמרת במסך הניתוח לצורך בדיקה. בשלב הבא נחבר שמירה קבועה ל־DB.
        </div>
      )}
    </div>
  );
}

function UploadPanel({ bank, onResult }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const b = BANKS[bank];

  const onFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bank', bank);
      fd.append('year', String(new Date().getFullYear()));
      const res = await fetch('/api/bank-analysis/parse', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בניתוח הקובץ');
      onResult(bank, data);
    } catch (err) {
      setError(err.message || 'שגיאה בניתוח הקובץ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">{b.icon} {b.label}</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            העלאת קבצי עו״ש: Excel, CSV, TXT או PDF. המערכת מפענחת את התנועות ומשווה מול חשבוניות הוצאות והכנסות שקיימות במערכת.
          </p>
        </div>
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold"
      >
        {loading ? 'מנתח קובץ…' : fileName || `העלה קובץ ${b.label}`}
      </button>
      <input ref={inputRef} type="file" accept=".csv,.txt,.xls,.xlsx,.pdf" onChange={onFile} className="hidden" />
      {error && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
    </section>
  );
}

function Summary({ rows, results }) {
  const summary = useMemo(() => ({
    rows: rows.length,
    debit: rows.reduce((s, r) => s + Number(r.debit || 0), 0),
    credit: rows.reduce((s, r) => s + Number(r.credit || 0), 0),
    matched: rows.filter(r => r.match_status === 'matched').length,
    gaps: rows.filter(r => r.match_status === 'possible_gap').length,
    missing: rows.filter(r => r.match_status === 'missing_invoice').length,
    attention: rows.filter(r => r.needs_attention).length,
  }), [rows]);
  const incomeTable = results.find(r => r?.income_table)?.income_table;
  const expenseCount = results.find(r => r)?.expenses_count || 0;
  const incomeCount = results.find(r => r)?.income_count || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
        <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">תנועות</div><div className="text-2xl font-black">{summary.rows}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">חובה</div><div className="text-2xl font-black text-red-600">₪{money(summary.debit)}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">העברות לזכות</div><div className="text-2xl font-black text-emerald-600">₪{money(summary.credit)}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">תואמות</div><div className="text-2xl font-black text-emerald-600">{summary.matched}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">פערים</div><div className="text-2xl font-black text-amber-600">{summary.gaps}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">חסרות</div><div className="text-2xl font-black text-red-600">{summary.missing}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">דורשות בדיקה</div><div className="text-2xl font-black text-orange-600">{summary.attention}</div></div>
      </div>
      <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 text-sm text-sky-900">
        נבדקו מול <b>{expenseCount}</b> חשבוניות הוצאות במערכת. {incomeTable ? <>נבדקו גם מול <b>{incomeCount}</b> רשומות הכנסה מטבלת <b>{incomeTable}</b>.</> : <>טבלת הכנסות לא זוהתה עדיין ולכן התאמות להעברות לזכות יוצגו כחסרות עד שנחבר את מקור חשבוניות ההכנסה.</>}
      </div>
    </div>
  );
}

function MatchesTable({ rows, decisions, setDecision }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden">
      <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
        <h2 className="font-black text-slate-900">תנועות והתאמות לחשבוניות</h2>
        <div className="text-xs text-slate-500">חובה ↔ חשבוניות הוצאות · העברה לזכות ↔ חשבוניות הכנסות · יתרה מוצגת רק כרקע</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-right p-3">בנק</th>
              <th className="text-right p-3">תאריך</th>
              <th className="text-right p-3">תיאור והערות</th>
              <th className="text-left p-3">חובה</th>
              <th className="text-left p-3">העברה לזכות</th>
              <th className="text-left p-3">יתרה</th>
              <th className="text-right p-3">סיווג</th>
              <th className="text-right p-3">התאמה</th>
              <th className="text-right p-3">דורש בדיקה</th>
              <th className="text-right p-3">החלטה ידנית</th>
              <th className="text-right p-3">חשבונית תואמת / פער</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const inv = r.match?.invoice;
              return (
                <tr key={r.id} className={`border-t hover:bg-slate-50 ${r.needs_attention ? 'bg-amber-50/30' : ''}`}>
                  <td className="p-3 whitespace-nowrap">{BANKS[r.bank]?.label || r.bank}</td>
                  <td className="p-3 whitespace-nowrap">{r.date || '—'}</td>
                  <td className="p-3 max-w-xl">
                    <div>{r.desc}</div>
                    {r.raw_text && <details className="mt-1 text-xs text-slate-400"><summary className="cursor-pointer text-sky-700">שורה מקורית</summary>{r.raw_text}</details>}
                  </td>
                  <td className="p-3 text-left text-red-600 font-bold">{r.debit ? '₪' + money(r.debit) : '—'}</td>
                  <td className="p-3 text-left text-emerald-600 font-bold">{r.credit ? '₪' + money(r.credit) : '—'}</td>
                  <td className="p-3 text-left text-slate-400">{r.balance ? '₪' + money(r.balance) : '—'}</td>
                  <td className="p-3"><span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">{r.category}</span></td>
                  <td className="p-3"><StatusBadge status={r.match_status} type={r.match_type} /></td>
                  <td className="p-3"><AttentionNotes notes={r.attention_notes} /></td>
                  <td className="p-3"><ManualDecision row={r} decision={decisions[r.id]} onChange={setDecision} /></td>
                  <td className="p-3 text-xs text-slate-600 min-w-[260px]">
                    {inv ? (
                      <div>
                        <div className="font-bold text-slate-800">{inv.vendor || inv.client_name || inv.customer_name || inv.file_name || 'חשבונית'}</div>
                        <div>סכום חשבונית: ₪{money(inv.amount || inv.total || inv.total_amount)}</div>
                        <div>פער סכום: ₪{money(r.match.amountDiff)} · פער ימים: {r.match.dateDiff}</div>
                        {inv.file_url && <a href={inv.file_url} target="_blank" rel="noreferrer" className="text-sky-700 underline">פתח חשבונית</a>}
                      </div>
                    ) : (
                      <span>לא נמצאה חשבונית תואמת במערכת</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BankImportPage() {
  const [results, setResults] = useState({ mizrahi: null, hapoalim: null });
  const [decisions, setDecisions] = useState({});
  const rows = useMemo(() => [
    ...(results.mizrahi?.rows || []),
    ...(results.hapoalim?.rows || []),
  ], [results]);

  const resultList = [results.mizrahi, results.hapoalim].filter(Boolean);
  const setDecision = (id, value) => setDecisions(prev => ({ ...prev, [id]: value }));

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900">🏦 בדיקת חשבונות עו״ש</h1>
          <p className="text-sm text-slate-500 mt-1">
            עמוד אחד לניתוח דפי עו״ש ממזרחי ופועלים, כולל השוואה לחשבוניות הוצאות והכנסות במערכת.
          </p>
        </div>

        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          המערכת אינה מחליטה במקום מנהל החשבונות. בכל ספק יש לסמן ידנית אם זו הוצאה עם חשבונית, הכנסה מלקוח שדורשת חשבונית מס, או פעולה שלא רלוונטית להנהלת חשבונות.
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <UploadPanel bank="mizrahi" onResult={(bank, data) => setResults(prev => ({ ...prev, [bank]: data }))} />
          <UploadPanel bank="hapoalim" onResult={(bank, data) => setResults(prev => ({ ...prev, [bank]: data }))} />
        </div>

        {rows.length > 0 && <Summary rows={rows} results={resultList} />}
        {rows.length > 0 && <MatchesTable rows={rows} decisions={decisions} setDecision={setDecision} />}

        {rows.length === 0 && (
          <section className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
            העלה קובץ עו״ש של מזרחי או פועלים כדי להתחיל ניתוח והשוואה לחשבוניות.
          </section>
        )}
      </div>
    </div>
  );
}
