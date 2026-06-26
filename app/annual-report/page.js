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

export default function AnnualReportPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pl'); // pl | vat | categories | pipeline | payroll
  const [payrollForm, setPayrollForm] = useState({ section: 'salary', item_name: '', month: new Date().getMonth() + 1, amount: '', notes: '' });
  const [saving, setSaving] = useState(false);

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
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
              <KpiCard title="סה״כ הכנסות" value={`₪${NIS(s.total_income)}`} sub={`${s.invoice_count} חשבוניות`} color="emerald" />
              <KpiCard title="גבוי בפועל" value={`₪${NIS(s.total_paid)}`} sub={s.total_unpaid > 0 ? `פתוח: ₪${NIS(s.total_unpaid)}` : 'הכל גבוי'} color="sky" />
              <KpiCard title="הוצאות משרד" value={`₪${NIS(s.office_expenses)}`} sub="הוצאות עסקיות" color="orange" />
              <KpiCard title="הוצאות אישיות" value={`₪${NIS(s.personal_expenses)}`} sub="ארנונות, שכירות" color="rose" />
              <KpiCard title="רווח נקי" value={`₪${NIS(s.net_profit)}`} sub={`מרווח ${PCT(s.gross_margin_pct)}`} color={s.net_profit >= 0 ? 'emerald' : 'red'} large />
              <KpiCard title="ניתן לניכוי" value={`₪${NIS(s.total_deductible)}`} sub="הוצאות מוכרות" color="violet" />
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
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── VAT Tab ── */}
            {tab === 'vat' && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <strong>דוח מע״מ דו-חודשי</strong> — עוסק מורשה מגיש אחת לחודשיים. מועד הגשה: 19 לחודש שלאחר התקופה.
                  מע״מ פלט (מכירות) מחושב לפי 18/118 מהחשבוניות. מע״מ תשומות מחושב לפי כללי ניכוי מסקיל israeliExpenseCategorizer.
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.vat_periods.filter(p => p.has_data).map((p, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5">
                      <div className="font-bold text-slate-800 mb-3 text-base">{p.period} {year}</div>
                      <div className="space-y-2 text-sm">
                        <VatRow label="מע״מ עסקאות (פלט)" value={p.output_vat} />
                        <VatRow label="מע״מ תשומות (קנייה)" value={p.input_vat} neg />
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>מע״מ לתשלום</span>
                          <span className={p.net_vat >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {p.net_vat >= 0 ? '' : '('}₪{NIS2(Math.abs(p.net_vat))}{p.net_vat < 0 ? ')' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">מועד הגשה: {p.due_date}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* VAT year total */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-bold mb-3">סיכום מע״מ שנתי {year}</h3>
                  <div className="grid grid-cols-3 gap-6 text-center">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">סה״כ מע״מ עסקאות</div>
                      <div className="text-xl font-bold text-rose-600">₪{NIS2(data.vat_periods.reduce((s, p) => s + p.output_vat, 0))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">סה״כ מע״מ תשומות</div>
                      <div className="text-xl font-bold text-emerald-600">₪{NIS2(data.vat_periods.reduce((s, p) => s + p.input_vat, 0))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">סה״כ מע״מ לתשלום</div>
                      <div className="text-xl font-bold text-slate-800">₪{NIS2(data.vat_periods.reduce((s, p) => s + p.net_vat, 0))}</div>
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
                        <td className="px-4 py-3" colSpan={2}>סה״כ</td>
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
