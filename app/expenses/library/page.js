'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

const money  = n => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const STATUS_CHIP = {
  approved:         { label: '✅ מאושר',          cls: 'bg-green-100 text-green-800' },
  linked:           { label: '🔗 מקושר',           cls: 'bg-sky-100 text-sky-800' },
  needs_review:     { label: '🔍 לסיווג',          cls: 'bg-orange-100 text-orange-800' },
  duplicate_review: { label: '⚠️ כפילות',          cls: 'bg-purple-100 text-purple-800' },
};

// ── Section labels in Hebrew ──────────────────────────────────────────────────
const SECTION_LABEL = {
  office:    'משרד',
  salary:    'שכר',
  tax:       'מס',
  insurance: 'ביטוח',
  it:        'מחשוב',
  marketing: 'שיווק',
  legal:     'משפטי',
  other:     'אחר',
};

function sectionLabel(s) { return SECTION_LABEL[s] || s || 'כללי'; }

// ── Single invoice card ───────────────────────────────────────────────────────
function DocCard({ doc }) {
  const chip = STATUS_CHIP[doc.status] || { label: doc.status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      {doc.file_url ? (
        <a href={doc.file_url} target="_blank" rel="noreferrer"
          className="shrink-0 w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-lg hover:bg-blue-100">
          📄
        </a>
      ) : (
        <div className="shrink-0 w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-lg">📃</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 truncate">{doc.vendor || doc.file_name || '—'}</p>
        <p className="text-xs text-gray-500">
          {doc.doc_date ? new Date(doc.doc_date).toLocaleDateString('he-IL') : '—'}
          {doc.expense_item && <span className="mr-2 text-gray-400">· {doc.expense_item}</span>}
        </p>
      </div>
      <div className="shrink-0 text-left">
        <p className="font-bold text-sm text-gray-900">{money(doc.amount)}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
      </div>
    </div>
  );
}

// ── Month panel ───────────────────────────────────────────────────────────────
function MonthPanel({ monthNum, year, docs, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  // Group docs by section
  const bySection = useMemo(() => {
    const map = {};
    for (const d of docs) {
      const sec = d.expense_section || 'other';
      if (!map[sec]) map[sec] = [];
      map[sec].push(d);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [docs]);

  const total     = docs.reduce((s, d) => s + Number(d.amount || 0), 0);
  const pending   = docs.filter(d => d.status === 'needs_review').length;
  const monthName = HE_MONTHS[monthNum - 1] || `חודש ${monthNum}`;

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {/* Month header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-800">{monthName} {year}</span>
          {pending > 0 && (
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending} לסיווג
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-semibold text-gray-700">{money(total)}</span>
          <span className="text-gray-400 text-sm">{docs.length} חשבוניות</span>
          <span className="text-gray-400">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t divide-y">
          {bySection.length === 0 && (
            <p className="px-5 py-6 text-center text-gray-400 text-sm">אין חשבוניות לחודש זה</p>
          )}
          {bySection.map(([sec, secDocs]) => {
            const secTotal = secDocs.reduce((s, d) => s + Number(d.amount || 0), 0);
            return (
              <details key={sec} className="group" open>
                <summary className="flex items-center justify-between px-5 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors list-none">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">{sectionLabel(sec)}</span>
                    <span className="text-xs text-gray-400">{secDocs.length} פריטים</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{money(secTotal)}</span>
                </summary>
                <div className="px-5 pb-2">
                  {secDocs.map(d => <DocCard key={d.id} doc={d} />)}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ExpenseLibraryPage() {
  const [year, setYear]       = useState(new Date().getFullYear());
  const [docs, setDocs]       = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/office-expenses?year=${year}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setDocs(d.docs || []); setEntries(d.entries || []); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year]);

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return docs;
    return docs.filter(d =>
      [d.vendor, d.file_name, d.description, d.expense_item, d.expense_section]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [docs, search]);

  // Group by month (1-12)
  const byMonth = useMemo(() => {
    const map = {};
    for (const d of filtered) {
      const m = Number(d.expense_month_num) || (d.doc_date ? new Date(d.doc_date).getMonth() + 1 : 0);
      if (!m) continue;
      if (!map[m]) map[m] = [];
      map[m].push(d);
    }
    return Object.entries(map)
      .map(([m, docs]) => ({ month: Number(m), docs }))
      .sort((a, b) => b.month - a.month);
  }, [filtered]);

  // Summary stats
  const totalAmount  = docs.reduce((s, d) => s + Number(d.amount || 0), 0);
  const pendingCount = docs.filter(d => d.status === 'needs_review').length;
  const approvedCount = docs.filter(d => d.status === 'approved' || d.status === 'linked').length;
  const currentMonth  = new Date().getMonth() + 1;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">📚 ספרייה חודשית של חשבוניות</h1>
              <p className="text-sm text-gray-500">כל החשבוניות לפי חודש ונושא — מקור הבדיקה לחיובי האשראי</p>
            </div>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Stats row */}
          {!loading && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              <div className="shrink-0 bg-blue-50 rounded-xl px-4 py-2 text-center">
                <p className="text-xl font-bold text-blue-700">{docs.length}</p>
                <p className="text-xs text-blue-500">חשבוניות</p>
              </div>
              <div className="shrink-0 bg-green-50 rounded-xl px-4 py-2 text-center">
                <p className="text-xl font-bold text-green-700">{money(totalAmount)}</p>
                <p className="text-xs text-green-500">סה"כ</p>
              </div>
              <div className="shrink-0 bg-orange-50 rounded-xl px-4 py-2 text-center">
                <p className="text-xl font-bold text-orange-600">{pendingCount}</p>
                <p className="text-xs text-orange-500">ממתינות לסיווג</p>
              </div>
              <div className="shrink-0 bg-emerald-50 rounded-xl px-4 py-2 text-center">
                <p className="text-xl font-bold text-emerald-700">{approvedCount}</p>
                <p className="text-xs text-emerald-500">מאושרות</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Search + quick links */}
        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש ספק, נושא, תיאור..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <Link href="/expenses/receipts"
            className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700">
            + העלה חשבונית
          </Link>
        </div>

        {/* Quick navigation to credit charges for comparison */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-2">
          <p className="text-sm text-amber-800">
            🔍 להשוואה מול חיובי האשראי ודפי החשבון:
          </p>
          <Link href="/credit-charges"
            className="shrink-0 text-sm font-semibold text-amber-700 underline">
            💳 חיובי אשראי
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">⏳</div>
            <p>טוען ספרייה...</p>
          </div>
        ) : byMonth.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">📭</div>
            <p>אין חשבוניות לשנת {year}</p>
            <Link href="/expenses/receipts" className="mt-3 inline-block text-blue-600 underline text-sm">
              העלה את הראשונה
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {byMonth.map(({ month, docs: mDocs }) => (
              <MonthPanel
                key={month}
                monthNum={month}
                year={year}
                docs={mDocs}
                defaultOpen={month === currentMonth}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
