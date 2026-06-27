'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const MONTHS = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const NIS = n => Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const NIS2 = n => Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = n => `${Number(n || 0).toFixed(1)}%`;

const SECTION_COLORS = {
  vehicle: 'bg-orange-100 text-orange-800',
  telecom: 'bg-blue-100 text-blue-800',
  software: 'bg-violet-100 text-violet-800',
  office: 'bg-slate-100 text-slate-700',
  professional: 'bg-emerald-100 text-emerald-800',
  insurance: 'bg-teal-100 text-teal-800',
  property: 'bg-red-100 text-red-800',
  rent: 'bg-amber-100 text-amber-800',
  general: 'bg-gray-100 text-gray-700',
};

// ITA input-VAT codes per רשות המסים
const ITA_VAT_CODES = {
  vehicle:       { code: 'T2', label: 'T2 — רכב (67%)' },
  telecom:       { code: 'T3', label: 'T3 — נייד (50%)' },
  software:      { code: 'T7', label: 'T7 — ריברס צ׳ארג׳' },
  entertainment: { code: 'T4', label: 'T4 — אירוח (0%)' },
  office:        { code: 'T1', label: 'T1 — תשומות רגיל' },
  professional:  { code: 'T1', label: 'T1 — תשומות רגיל' },
  insurance:     { code: 'T6', label: 'T6 — פטור ממע"מ' },
  rent:          { code: 'T6', label: 'T6 — פטור ממע"מ' },
  property:      { code: 'T6', label: 'T6 — פטור ממע"מ' },
  general:       { code: 'T1', label: 'T1 — תשומות רגיל' },
};

export default function AnnualReportPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pl'); // pl | vat | categories | pipeline | payroll | budget
  const [payrollForm, setPayrollForm] = useState({ section: 'salary', item_name: '', month: new Date().getMonth() + 1, amount: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [targetIncome, setTargetIncome] = useState(50000);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/annual-report?year=${year}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      setData(await res.json());
    } catch {}
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const savePayroll = async () => {
    if (!payrollForm.amount || !payrollForm.item_name) return;
    setSaving(true);
    try {
      await fetch('/api/office-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payrollForm, year, amount: Number(payrollForm.amount) }),
      });
      setPayrollForm(f => ({ ...f, item_name: '', amount: '', notes: '' }));
      await load();
    } catch {}
    setSaving(false);
  };

  const s = data?.summary;
  const months = data?.monthly_combined?.filter(m => m.income > 0 || m.expenses > 0) || [];
  const maxBar = Math.max(...months.map(m => Math.max(m.income, m.expenses)), 1);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-20">
      {/* ── Header ── */}
      <header className="bg-slate-900 text-white sticky top-12 z-30">
        <div className="max-w-[1400px] mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-white text-sm">← ראשי</Link>
          <h1 className="text-xl font-bold">📊 דוח שנתי — {year}</h1>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm border-0">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex-1" />
          <span className="text-xs text-slate-400">עדכון אחרון: {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={load} className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-sm">רענן</button>
          <button onClick={() => window.print()}
            className="bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium print:hidden">
            🖨️ הדפס
          </button>
          <a href={`/api/annual-report/export?year=${year}`}
            className="bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded-lg text-sm font-medium print:hidden">
            📥 ייצוא CSV
          </a>
          <a href={`/api/annual-report/hashavshevet?year=${year}`}
            className="bg-purple-700 hover:bg-purple-600 px-3 py-1.5 rounded-lg text-sm font-medium print:hidden"
            title="ייצא פקודות יומן לייבוא בחשבשבת">
            ⬇️ ייצוא לחשבשבת
          </a>
          <button
            onClick={async () => {
              const res = await fetch('/api/cron/scan-outlook?days=30', { method: 'POST' });
              const d = await res.json();
              alert(d.error ? `שגיאה: ${d.error}` : `Outlook: נמצאו ${d.found||0} | יובאו ${d.imported||0} | לסיווג ${d.pending_review||0}`);
              load();
            }}
            className="bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg text-sm font-medium"
            title="סרוק Outlook/Hotmail לתלושי שכר, מסים וחשבוניות"
          >
            📨 סרוק Outlook
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-5 py-6 space-y-6">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-lg">טוען דוח שנתי…</div>
        ) : !data ? (
          <div className="py-20 text-center text-red-500">שגיאה בטעינת הנתונים</div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
              <KpiCard title="סה״כ הכנסות" value={`₪${NIS(s.total_income)}`} sub={`${s.invoice_count} חשבוניות`} color="emerald" />
              <KpiCard title="גבוי בפועל" value={`₪${NIS(s.total_paid)}`} sub={s.total_unpaid > 0 ? `פתוח: ₪${NIS(s.total_unpaid)}` : 'הכל גבוי'} color="sky" />
              <KpiCard title="הוצאות משרד" value={`₪${NIS(s.office_expenses)}`} sub="הוצאות עסקיות" color="orange" />
              <KpiCard title="הוצאות אישיות" value={`₪${NIS(s.personal_expenses)}`} sub="ארנונות, שכירות" color="rose" />
              <KpiCard title="רווח נקי" value={`₪${NIS(s.net_profit)}`} sub={`מרווח ${PCT(s.gross_margin_pct)}`} color={s.net_profit >= 0 ? 'emerald' : 'red'} large />
              <KpiCard title="ניתן לניכוי" value={`₪${NIS(s.total_deductible)}`} sub="הוצאות מוכרות" color="violet" />
              <KpiCard title="מס הכנסה משוער" value={`₪${NIS(data.estimated_tax_liability)}`} sub="23% על רווח" color="amber" />
            </div>

            {/* ── Pipeline Banner ── */}
            {data.pipeline && (
              <div className="bg-gradient-to-l from-slate-800 to-slate-700 text-white rounded-2xl p-5 flex flex-wrap gap-8 items-center">
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">שכר טרחה מוסכם בתיקים</div>
                  <div className="text-3xl font-bold">₪{NIS(data.pipeline.total_agreed)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">גבוי</div>
                  <div className="text-2xl font-semibold text-emerald-400">₪{NIS(data.pipeline.total_collected)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">יתרה לגבייה</div>
                  <div className="text-2xl font-semibold text-amber-400">₪{NIS(data.pipeline.total_balance)}</div>
                </div>
                <div className="text-xs text-slate-300 flex-1 text-left">
                  {data.pipeline.total_matters} תיקים פעילים<br />
                  {data.docs_pending > 0 && <span className="text-orange-400">{data.docs_pending} קבלות ממתינות לסיווג</span>}
                </div>
              </div>
            )}

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-slate-200 rounded-xl p-1 w-fit">
              {[
                { id: 'pl', label: 'דו"ח רווח והפסד' },
                { id: 'vat', label: 'דו"ח מע"מ' },
                { id: 'categories', label: 'סיווג הוצאות' },
                { id: 'pipeline', label: 'עסקאות בצינור' },
                { id: 'payroll', label: 'שכר, פנסיה ומסים' },
                { id: 'budget', label: '📊 תקציב' },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── P&L Tab ── */}
            {tab === 'pl' && (
              <div className="space-y-5">
                {/* Bar Chart */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="font-bold text-slate-800 mb-4">הכנסות מול הוצאות לפי חודש</h2>
                  <div className="flex gap-3 items-end h-48 overflow-x-auto pb-2">
                    {months.map(m => (
                      <div key={m.month} className="flex flex-col items-center gap-1 min-w-[70px]">
                        <div className="flex gap-1 items-end h-36">
                          <div className="w-7 rounded-t-md bg-emerald-500 opacity-90 transition-all"
                            style={{ height: `${(m.income / maxBar) * 100}%` }}
                            title={`הכנסות: ₪${NIS(m.income)}`} />
                          <div className="w-7 rounded-t-md bg-rose-400 opacity-90 transition-all"
                            style={{ height: `${(m.expenses / maxBar) * 100}%` }}
                            title={`הוצאות: ₪${NIS(m.expenses)}`} />
                        </div>
                        <span className="text-xs text-slate-500">{m.month_he}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 text-xs text-slate-500 mt-2">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> הכנסות</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-400 inline-block" /> הוצאות</span>
                  </div>
                </div>

                {/* P&L Table — Israeli format */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-800 text-white px-5 py-3 flex items-center gap-3">
                    <span className="font-bold">דוח רווח והפסד (דוח רווח והפסד)</span>
                    <span className="text-slate-400 text-sm">לתקופה 1 ינואר – 31 דצמבר {year} | בש"ח</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-xs">
                          <th className="text-right px-4 py-2 border-b">סעיף</th>
                          {months.map(m => <th key={m.month} className="text-left px-3 py-2 border-b whitespace-nowrap">{m.month_he}</th>)}
                          <th className="text-left px-3 py-2 border-b font-bold bg-slate-100">סה״כ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PLRow label="הכנסות (הכנסות)" months={months} field="income" total={s.total_income} bold />
                        <PLRow label="הוצאות עסקיות" months={months} field="office_exp" total={s.office_expenses} neg />
                        <PLRow label="הוצאות אישיות" months={months} field="personal_exp" total={s.personal_expenses} neg muted />
                        {s.salary_total > 0 && <PLRow label="שכר" months={months} field="salary" total={s.salary_total} neg />}
                        {s.pension_total > 0 && <PLRow label="פנסיה / ביטוח מנהלים" months={months} field="pension" total={s.pension_total} neg />}
                        {s.vat_payments_total > 0 && <PLRow label="מע״מ שולם" months={months} field="vat_payment" total={s.vat_payments_total} neg muted />}
                        {s.income_tax_total > 0 && <PLRow label="מס הכנסה / מקדמות" months={months} field="income_tax" total={s.income_tax_total} neg muted />}
                        <tr className="bg-slate-50 font-bold">
                          <td className="px-4 py-3 border-t-2 border-slate-300">רווח תפעולי (רווח תפעולי)</td>
                          {months.map(m => (
                            <td key={m.month} className={`px-3 py-3 border-t-2 border-slate-300 text-left font-bold ${m.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {m.net >= 0 ? '' : '('}{NIS(Math.abs(m.net))}{m.net < 0 ? ')' : ''}
                            </td>
                          ))}
                          <td className={`px-3 py-3 border-t-2 border-slate-300 text-left font-bold text-lg ${s.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            ₪{NIS(s.net_profit)}
                          </td>
                        </tr>
                        <tr className="text-xs text-slate-400">
                          <td className="px-4 py-2">מרווח גולמי</td>
                          {months.map(m => (
                            <td key={m.month} className="px-3 py-2 text-left">
                              {m.income > 0 ? PCT(((m.income - m.expenses) / m.income) * 100) : '—'}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-left font-semibold">{PCT(s.gross_margin_pct)}</td>
                        </tr>
                        {data.estimated_tax_liability > 0 && (
                          <tr className="text-xs text-amber-700 bg-amber-50">
                            <td className="px-4 py-2">מס הכנסה משוער (23%)</td>
                            {months.map(m => (
                              <td key={m.month} className="px-3 py-2 text-left">
                                {m.net > 0 ? `(₪${NIS(m.net * 0.23)})` : '—'}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-left font-bold">(₪{NIS(data.estimated_tax_liability)})</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── VAT Tab ── */}
            {tab === 'vat' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    <strong>דוח מע״מ דו-חודשי</strong> — עוסק מורשה מגיש אחת לחודשיים. מועד הגשה: <strong>19</strong> לחודש שלאחר התקופה.
                    מע״מ פלט (מכירות) מחושב לפי 18/118 מהחשבוניות. מע״מ תשומות לפי כללי ניכוי ישראליים (רכב 45%, טלפון 50%, אירוח 0%).
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-800">
                    <strong>📋 PCN874 — דוח מע״מ מפורט</strong> — חובה מ-1.1.2026 לעוסק מורשה עם מחזור מעל 500,000 ₪.
                    מועד הגשה: <strong>23</strong> לחודש שלאחר התקופה (לא 19). לחץ על <strong>PCN874 ↓</strong> בכל תקופה להורדת הקובץ.
                    יש להגיש רשמית דרך <span className="underline">gov.il → שע״מ</span>.
                  </div>
                </div>
                {/* Allocation number threshold warning */}
                <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 text-sm text-yellow-800">
                  <strong>⚠️ מספר הקצאה (mispar haktzaa)</strong> — חשבוניות קנייה ללא מספר הקצאה מעל הסף לא יוכרו לניכוי מע"מ תשומות.<br/>
                  <span className="font-mono">עד 31.5.2026: סף 10,000 ₪ | מ-1.6.2026: סף 5,000 ₪</span>
                  <span className="mr-3 text-yellow-600"> — בדוק שכל חשבונית ספק מעל הסף כוללת מספר הקצאה.</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.vat_periods.filter(p => p.has_data).map((p, i) => {
                    const salesBase = p.output_vat / 0.18;
                    const inputBase = p.input_vat / 0.18;
                    return (
                      <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-slate-800 text-base">{p.period} {year}</span>
                          <a href={`/api/annual-report/pcn874?year=${year}&period=${i + 1}`}
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-medium"
                            title="ייצא PCN874 — דוח מע״מ מפורט (חובה מ-2026)">
                            PCN874 ↓
                          </a>
                        </div>
                        <div className="space-y-2 text-sm">
                          <VatRow label="מע״מ עסקאות (פלט)" value={p.output_vat} />
                          <VatRow label="מע״מ תשומות (קנייה)" value={p.input_vat} neg />
                          <div className="border-t pt-2 flex justify-between font-bold">
                            <span>מע״מ לתשלום</span>
                            <span className={p.net_vat >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {p.net_vat >= 0 ? '' : '('}₪{NIS2(Math.abs(p.net_vat))}{p.net_vat < 0 ? ')' : ''}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">מועד הגשה: {p.due_date} | PCN874: 23 ל{p.due_date?.split(' ל')[1] || ''}</div>
                        </div>
                        {/* VAT Return Fields 1-9 */}
                        <details className="mt-3">
                          <summary className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer font-medium">▸ שדות טופס מע״מ 1–9 (לדיווח לשע״מ)</summary>
                          <div className="mt-2 space-y-1 text-xs border-t border-slate-100 pt-2">
                            {[
                              ['1', 'מכירות חייבות (ללא מע״מ)', salesBase, 'text-slate-700'],
                              ['2', 'מכירות בשיעור אפס (ייצוא)', 0, 'text-slate-400'],
                              ['3', 'מכירות פטורות', 0, 'text-slate-400'],
                              ['4', 'מע״מ עסקאות', p.output_vat, 'text-rose-600'],
                              ['5', 'קניות חייבות (ללא מע״מ)', inputBase, 'text-slate-700'],
                              ['6', 'מע״מ תשומות', p.input_vat, 'text-emerald-600'],
                              ['7', 'מע״מ נטו (שדה 4 פחות שדה 6)', p.net_vat, p.net_vat >= 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'],
                              ['8', 'תיאומים', 0, 'text-slate-400'],
                              ['9', 'לתשלום / להחזר', p.net_vat, p.net_vat >= 0 ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'],
                            ].map(([num, label, val, cls]) => (
                              <div key={num} className="flex justify-between items-center">
                                <span className="text-slate-400 w-5 flex-shrink-0">{num}.</span>
                                <span className="flex-1 text-slate-600">{label}</span>
                                <span className={`font-mono ${cls}`}>₪{NIS2(val)}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
                {/* VAT year total */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-bold mb-3">סיכום מע״מ שנתי {year}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">סה״כ מע״מ עסקאות</div>
                      <div className="text-xl font-bold text-rose-600">₪{NIS2(data.vat_periods.reduce((s, p) => s + p.output_vat, 0))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">סה״כ מע״מ תשומות</div>
                      <div className="text-xl font-bold text-emerald-600">₪{NIS2(data.vat_periods.reduce((s, p) => s + p.input_vat, 0))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">מע״מ נטו לתשלום (חישוב)</div>
                      <div className="text-xl font-bold text-slate-800">₪{NIS2(data.vat_periods.reduce((s, p) => s + p.net_vat, 0))}</div>
                    </div>
                    <div className={s.vat_payments_total > 0 ? '' : 'opacity-40'}>
                      <div className="text-xs text-slate-500 mb-1">מע״מ ששולם בפועל</div>
                      <div className="text-xl font-bold text-orange-600">₪{NIS2(s.vat_payments_total)}</div>
                      {s.vat_payments_total === 0 && <div className="text-xs text-slate-400 mt-1">הזן בלשונית שכר ומסים</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Categories Tab ── */}
            {tab === 'categories' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                  <strong>סיווג לפי פקודת מס הכנסה ותקנות ניכוי הוצאות מסויימות 1972.</strong>
                  רכב — כלל הגבוה: 45% או הוצאות פחות שווי שימוש. טלפון נייד — תקרת 50%. אירוח לקוחות ישראלים — 0%. כיבוד קל — 80%.
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-xs">
                        <th className="text-right px-4 py-3 border-b">קטגוריה</th>
                        <th className="text-right px-4 py-3 border-b">קוד חשבון</th>
                        <th className="text-right px-4 py-3 border-b">קוד מע"מ ITA</th>
                        <th className="text-left px-4 py-3 border-b">סה״כ הוצאה</th>
                        <th className="text-left px-4 py-3 border-b">% ניכוי</th>
                        <th className="text-left px-4 py-3 border-b">סכום מוכר</th>
                        <th className="text-left px-4 py-3 border-b">לא מוכר</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.expense_by_category || []).map((cat, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SECTION_COLORS[cat.cat] || 'bg-gray-100 text-gray-700'}`}>
                              {cat.cat_he}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{cat.account}xx</td>
                          <td className="px-4 py-3">
                            {ITA_VAT_CODES[cat.cat] && (
                              <span className="inline-block text-xs px-1.5 py-0.5 rounded font-mono bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {ITA_VAT_CODES[cat.cat].code}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-left font-medium">₪{NIS(cat.total)}</td>
                          <td className="px-4 py-3 text-left">
                            <span className={`text-xs font-bold ${cat.deductible / cat.total >= 0.9 ? 'text-emerald-600' : cat.deductible / cat.total >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                              {cat.total > 0 ? PCT((cat.deductible / cat.total) * 100) : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-left text-emerald-700 font-semibold">₪{NIS(cat.deductible)}</td>
                          <td className="px-4 py-3 text-left text-red-600">₪{NIS(cat.total - cat.deductible)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold text-sm">
                        <td className="px-4 py-3" colSpan={3}>סה״כ</td>
                        <td className="px-4 py-3 text-left">₪{NIS(s.total_expenses)}</td>
                        <td className="px-4 py-3 text-left">{s.total_expenses > 0 ? PCT((s.total_deductible / s.total_expenses) * 100) : '—'}</td>
                        <td className="px-4 py-3 text-left text-emerald-700">₪{NIS(s.total_deductible)}</td>
                        <td className="px-4 py-3 text-left text-red-600">₪{NIS(s.total_expenses - s.total_deductible)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Detailed items */}
                <details className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <summary className="px-5 py-4 cursor-pointer font-semibold text-slate-700 hover:bg-slate-50">פירוט מלא לפי פריט</summary>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 text-slate-500">
                        <th className="text-right px-4 py-2 border-b">פריט</th>
                        <th className="text-right px-4 py-2 border-b">חודש</th>
                        <th className="text-left px-4 py-2 border-b">סכום</th>
                        <th className="text-left px-4 py-2 border-b">ניכוי</th>
                        <th className="text-right px-4 py-2 border-b">הערה</th>
                      </tr></thead>
                      <tbody>
                        {(data.expense_by_category || []).flatMap(cat =>
                          cat.items.map((item, j) => (
                            <tr key={`${cat.cat}-${j}`} className="border-b hover:bg-slate-50">
                              <td className="px-4 py-2">{item.name}</td>
                              <td className="px-4 py-2 text-slate-500">{MONTHS[item.month]}</td>
                              <td className="px-4 py-2 text-left">₪{NIS(item.amount)}</td>
                              <td className="px-4 py-2 text-left">
                                <span className={item.deduct_pct === 100 ? 'text-emerald-600' : item.deduct_pct === 0 ? 'text-red-600' : 'text-amber-600'}>
                                  {item.deduct_pct}%
                                </span>
                              </td>
                              <td className="px-4 py-2 text-slate-400">{item.note || ''}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            {/* ── Pipeline Tab ── */}
            {tab === 'pipeline' && (
              <div className="space-y-5">
                <div className="grid md:grid-cols-3 gap-4">
                  <BigStat label="שכר טרחה מוסכם" value={`₪${NIS(data.pipeline?.total_agreed)}`} color="slate" />
                  <BigStat label="גבוי בפועל" value={`₪${NIS(data.pipeline?.total_collected)}`} color="emerald" />
                  <BigStat label="יתרה לגבייה" value={`₪${NIS(data.pipeline?.total_balance)}`} color="amber" />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-bold mb-4 text-slate-700">יחס גבייה</h3>
                  <div className="space-y-3">
                    <ProgressBar
                      label="גבוי מהמוסכם"
                      value={data.pipeline?.total_agreed > 0 ? (data.pipeline.total_collected / data.pipeline.total_agreed) * 100 : 0}
                      color="emerald"
                    />
                    <ProgressBar
                      label="הכנסות חשבוניות מהמוסכם"
                      value={data.pipeline?.total_agreed > 0 ? (s.total_income / data.pipeline.total_agreed) * 100 : 0}
                      color="sky"
                    />
                  </div>
                  <div className="mt-4 text-xs text-slate-500 space-y-1">
                    <div>• שכר טרחה מוסכם = סה״כ agreed_fee בתיקים פעילים</div>
                    <div>• גבוי = sum collected_amount בתיקים</div>
                    <div>• יתרה = balance_amount (כולל חוב בביצוע)</div>
                    <div>• הכנסות חשבוניות = חשבוניות שהוצאו בשנה זו (כולל ישנות שנגבו)</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Payroll Tab ── */}
            {tab === 'payroll' && (
              <div className="space-y-5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
                  הזן כאן תלושי שכר, תשלומי פנסיה, מע״מ ומס הכנסה. בהמשך הנתונים יגיעו אוטומטית ממייל Hotmail.
                </div>
                {/* KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard title="שכר מצטבר" value={`₪${NIS(s?.salary_total)}`} sub="תלושי שכר" color="slate" />
                  <KpiCard title="פנסיה וביטוח" value={`₪${NIS(s?.pension_total)}`} sub="הפרשות" color="teal" />
                  <KpiCard title="מע״מ שולם" value={`₪${NIS(s?.vat_payments_total)}`} sub="תשלומי מע״מ בפועל" color="orange" />
                  <KpiCard title="מס הכנסה" value={`₪${NIS(s?.income_tax_total)}`} sub="מקדמות ותשלומים" color="rose" />
                </div>
                {/* Entry form */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-800 mb-4">הוסף רשומה חדשה</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">סוג</label>
                      <select value={payrollForm.section} onChange={e => setPayrollForm(f => ({ ...f, section: e.target.value }))}
                        className="w-full border rounded-xl px-3 py-2 text-sm">
                        <option value="salary">שכר</option>
                        <option value="pension">פנסיה / ביטוח מנהלים</option>
                        <option value="vat_payment">תשלום מע״מ</option>
                        <option value="income_tax">מס הכנסה / מקדמות</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">פרטים / שם</label>
                      <input value={payrollForm.item_name} onChange={e => setPayrollForm(f => ({ ...f, item_name: e.target.value }))}
                        placeholder="לדוג׳: תלוש עופר ינואר" className="w-full border rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">חודש</label>
                      <select value={payrollForm.month} onChange={e => setPayrollForm(f => ({ ...f, month: Number(e.target.value) }))}
                        className="w-full border rounded-xl px-3 py-2 text-sm">
                        {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">סכום ₪</label>
                      <input type="number" value={payrollForm.amount} onChange={e => setPayrollForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0" className="w-full border rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <button onClick={savePayroll} disabled={saving || !payrollForm.amount || !payrollForm.item_name}
                        className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-semibold">
                        {saving ? 'שומר…' : '+ הוסף'}
                      </button>
                    </div>
                  </div>
                </div>
                {/* Quick link to payroll calculator */}
                <a href="/payroll-calculator" target="_blank"
                  className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 hover:bg-blue-100 transition">
                  <span className="text-2xl">💰</span>
                  <div>
                    <div className="font-semibold text-blue-800 text-sm">מחשבון שכר ישראלי 2026</div>
                    <div className="text-xs text-blue-600">ברוטו → נטו | מדרגות מס | ביטוח לאומי | זיכוי פנסיה 45א</div>
                  </div>
                  <span className="mr-auto text-blue-400">←</span>
                </a>
                {/* Monthly table for salary/pension/tax */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100 px-5 py-3 font-semibold text-slate-700 text-sm">סיכום חודשי — שכר, פנסיה ומסים</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="text-right px-4 py-2 border-b">חודש</th>
                        <th className="text-left px-3 py-2 border-b">שכר</th>
                        <th className="text-left px-3 py-2 border-b">פנסיה</th>
                        <th className="text-left px-3 py-2 border-b">מע״מ שולם</th>
                        <th className="text-left px-3 py-2 border-b">מס הכנסה</th>
                        <th className="text-left px-3 py-2 border-b font-bold">סה״כ</th>
                      </tr></thead>
                      <tbody>
                        {(data?.monthly_expenses || []).filter(m => m.salary + m.pension + m.vat_payment + m.income_tax > 0).map(m => (
                          <tr key={m.month} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium">{m.month_he}</td>
                            <td className="px-3 py-2.5 text-left">{m.salary > 0 ? `₪${NIS(m.salary)}` : '—'}</td>
                            <td className="px-3 py-2.5 text-left">{m.pension > 0 ? `₪${NIS(m.pension)}` : '—'}</td>
                            <td className="px-3 py-2.5 text-left text-orange-600">{m.vat_payment > 0 ? `₪${NIS(m.vat_payment)}` : '—'}</td>
                            <td className="px-3 py-2.5 text-left text-rose-600">{m.income_tax > 0 ? `₪${NIS(m.income_tax)}` : '—'}</td>
                            <td className="px-3 py-2.5 text-left font-semibold">₪{NIS(m.salary + m.pension + m.vat_payment + m.income_tax)}</td>
                          </tr>
                        ))}
                        {(data?.monthly_expenses || []).every(m => m.salary + m.pension + m.vat_payment + m.income_tax === 0) && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                            עוד לא הוזנו נתוני שכר, פנסיה או מסים. הוסף בטופס למעלה.
                          </td></tr>
                        )}
                      </tbody>
                      {(s?.salary_total + s?.pension_total + s?.vat_payments_total + s?.income_tax_total) > 0 && (
                        <tfoot><tr className="bg-slate-800 text-white font-bold">
                          <td className="px-4 py-3">סה״כ {year}</td>
                          <td className="px-3 py-3 text-left">₪{NIS(s?.salary_total)}</td>
                          <td className="px-3 py-3 text-left">₪{NIS(s?.pension_total)}</td>
                          <td className="px-3 py-3 text-left">₪{NIS(s?.vat_payments_total)}</td>
                          <td className="px-3 py-3 text-left">₪{NIS(s?.income_tax_total)}</td>
                          <td className="px-3 py-3 text-left">₪{NIS((s?.salary_total || 0) + (s?.pension_total || 0) + (s?.vat_payments_total || 0) + (s?.income_tax_total || 0))}</td>
                        </tr></tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Budget Tab ── */}
            {tab === 'budget' && (
              <div className="space-y-5">
                {/* Target income input */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">יעד הכנסה חודשי (₪)</label>
                    <input
                      type="number"
                      value={targetIncome}
                      onChange={e => setTargetIncome(Number(e.target.value) || 0)}
                      className="border rounded-xl px-3 py-2 text-sm w-40 text-left"
                      min={0}
                      step={1000}
                    />
                  </div>
                  <div className="text-xs text-slate-500 mt-4">
                    הגדר יעד הכנסה חודשי. טור ✓/✗ יציג האם הגעת ליעד בכל חודש.
                  </div>
                </div>

                {/* Budget comparison table */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-800 text-white px-5 py-3 flex items-center gap-3">
                    <span className="font-bold">השוואת תקציב — {year}</span>
                    <span className="text-slate-400 text-sm">יעד חודשי: ₪{NIS(targetIncome)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-xs">
                          <th className="text-right px-4 py-2 border-b">חודש</th>
                          <th className="text-left px-3 py-2 border-b">הכנסות</th>
                          <th className="text-left px-3 py-2 border-b">הוצאות</th>
                          <th className="text-left px-3 py-2 border-b">רווח נטו</th>
                          <th className="text-center px-3 py-2 border-b">יעד</th>
                          <th className="text-left px-3 py-2 border-b">פער מהיעד</th>
                        </tr>
                      </thead>
                      <tbody>
                        {months.map(m => {
                          const hitTarget = m.income >= targetIncome;
                          const gap = m.income - targetIncome;
                          return (
                            <tr key={m.month} className="border-b hover:bg-slate-50">
                              <td className="px-4 py-2.5 font-medium">{m.month_he}</td>
                              <td className="px-3 py-2.5 text-left text-emerald-700 font-semibold">₪{NIS(m.income)}</td>
                              <td className="px-3 py-2.5 text-left text-rose-600">₪{NIS(m.expenses)}</td>
                              <td className={`px-3 py-2.5 text-left font-semibold ${m.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {m.net >= 0 ? '' : '('}₪{NIS(Math.abs(m.net))}{m.net < 0 ? ')' : ''}
                              </td>
                              <td className="px-3 py-2.5 text-center text-lg">
                                {hitTarget ? '✅' : '❌'}
                              </td>
                              <td className={`px-3 py-2.5 text-left font-medium ${gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {gap >= 0 ? '+' : ''}₪{NIS(gap)}
                              </td>
                            </tr>
                          );
                        })}
                        {months.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">אין נתונים לשנה זו</td></tr>
                        )}
                      </tbody>
                      {months.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-800 text-white font-bold">
                            <td className="px-4 py-3">סה״כ {year}</td>
                            <td className="px-3 py-3 text-left text-emerald-400">₪{NIS(months.reduce((s, m) => s + m.income, 0))}</td>
                            <td className="px-3 py-3 text-left text-rose-400">₪{NIS(months.reduce((s, m) => s + m.expenses, 0))}</td>
                            <td className="px-3 py-3 text-left text-emerald-400">₪{NIS(months.reduce((s, m) => s + m.net, 0))}</td>
                            <td className="px-3 py-3 text-center">
                              {months.filter(m => m.income >= targetIncome).length}/{months.length} חודשים
                            </td>
                            <td className="px-3 py-3 text-left">
                              ממוצע: ₪{NIS(Math.round(months.reduce((s, m) => s + m.income, 0) / (months.length || 1)))}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Summary cards */}
                {months.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard
                      title="חודשים שעמדו ביעד"
                      value={`${months.filter(m => m.income >= targetIncome).length} / ${months.length}`}
                      sub={`יעד: ₪${NIS(targetIncome)} / חודש`}
                      color={months.filter(m => m.income >= targetIncome).length >= months.length * 0.7 ? 'emerald' : 'rose'}
                    />
                    <KpiCard
                      title="ממוצע הכנסות חודשי"
                      value={`₪${NIS(Math.round(months.reduce((s, m) => s + m.income, 0) / (months.length || 1)))}`}
                      sub={months.reduce((s, m) => s + m.income, 0) / (months.length || 1) >= targetIncome ? 'מעל היעד ✅' : 'מתחת ליעד ❌'}
                      color={months.reduce((s, m) => s + m.income, 0) / (months.length || 1) >= targetIncome ? 'emerald' : 'amber'}
                    />
                    <KpiCard
                      title="ממוצע הוצאות חודשי"
                      value={`₪${NIS(Math.round(months.reduce((s, m) => s + m.expenses, 0) / (months.length || 1)))}`}
                      sub="הוצאות עסקיות"
                      color="orange"
                    />
                    <KpiCard
                      title="ממוצע רווח נטו"
                      value={`₪${NIS(Math.round(months.reduce((s, m) => s + m.net, 0) / (months.length || 1)))}`}
                      sub="לאחר כל הוצאות"
                      color={months.reduce((s, m) => s + m.net, 0) >= 0 ? 'sky' : 'red'}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Summary Table ── */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-800 text-white px-5 py-3 font-bold">סיכום שנתי — {year}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs">
                      <th className="text-right px-4 py-2 border-b">חודש</th>
                      <th className="text-left px-3 py-2 border-b">חשבוניות</th>
                      <th className="text-left px-3 py-2 border-b">הכנסות</th>
                      <th className="text-left px-3 py-2 border-b">גבוי</th>
                      <th className="text-left px-3 py-2 border-b">הוצאות</th>
                      <th className="text-left px-3 py-2 border-b">רווח נקי</th>
                      <th className="text-left px-3 py-2 border-b">מרווח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map(m => (
                      <tr key={m.month} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium">{m.month_he}</td>
                        <td className="px-3 py-2.5 text-left text-slate-500">{m.invoices}</td>
                        <td className="px-3 py-2.5 text-left">₪{NIS(m.income)}</td>
                        <td className="px-3 py-2.5 text-left text-emerald-600">₪{NIS(m.paid)}</td>
                        <td className="px-3 py-2.5 text-left text-rose-600">₪{NIS(m.expenses)}</td>
                        <td className={`px-3 py-2.5 text-left font-semibold ${m.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {m.net >= 0 ? '' : '('}₪{NIS(Math.abs(m.net))}{m.net < 0 ? ')' : ''}
                        </td>
                        <td className="px-3 py-2.5 text-left text-slate-500">
                          {m.income > 0 ? PCT(((m.net / m.income) * 100)) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-800 text-white font-bold">
                      <td className="px-4 py-3">סה״כ {year}</td>
                      <td className="px-3 py-3 text-left">{s.invoice_count}</td>
                      <td className="px-3 py-3 text-left">₪{NIS(s.total_income)}</td>
                      <td className="px-3 py-3 text-left text-emerald-400">₪{NIS(s.total_paid)}</td>
                      <td className="px-3 py-3 text-left text-rose-400">₪{NIS(s.total_expenses)}</td>
                      <td className="px-3 py-3 text-left text-emerald-400">₪{NIS(s.net_profit)}</td>
                      <td className="px-3 py-3 text-left">{PCT(s.gross_margin_pct)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
const COLOR_MAP = {
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  sky: 'bg-sky-50 border-sky-200 text-sky-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  rose: 'bg-rose-50 border-rose-200 text-rose-700',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
  slate: 'bg-slate-50 border-slate-200 text-slate-700',
};

function KpiCard({ title, value, sub, color, large }) {
  const cls = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-xs font-medium mb-1 opacity-70">{title}</div>
      <div className={`font-bold ${large ? 'text-2xl' : 'text-xl'}`}>{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function PLRow({ label, months, field, total, bold, neg, muted }) {
  const NIS = n => Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (
    <tr className={`border-b ${muted ? 'opacity-60' : ''} ${bold ? 'font-semibold' : ''}`}>
      <td className="px-4 py-2.5 text-slate-700">{label}</td>
      {months.map(m => (
        <td key={m.month} className={`px-3 py-2.5 text-left ${neg ? 'text-rose-600' : 'text-slate-700'}`}>
          {neg ? `(${NIS(m[field])})` : `₪${NIS(m[field])}`}
        </td>
      ))}
      <td className={`px-3 py-2.5 text-left font-bold ${neg ? 'text-rose-700' : 'text-slate-800'} bg-slate-50`}>
        {neg ? `(₪${NIS(total)})` : `₪${NIS(total)}`}
      </td>
    </tr>
  );
}

function VatRow({ label, value, neg }) {
  const NIS2 = n => Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={neg ? 'text-emerald-600' : 'text-slate-700'}>₪{NIS2(value)}</span>
    </div>
  );
}

function BigStat({ label, value, color }) {
  const cls = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <div className={`rounded-2xl border p-5 text-center ${cls}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function ProgressBar({ label, value, color }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const barColor = color === 'emerald' ? 'bg-emerald-500' : color === 'sky' ? 'bg-sky-500' : 'bg-slate-500';
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
