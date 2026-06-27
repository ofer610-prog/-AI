'use client';
import { useState } from 'react';

const fmt = (n) => n?.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—';
const fmtN = (n) => n?.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—';

const DEFAULT = {
  grossCash: 15000,
  creditPoints: 2.25,
  shoviRechev: 0,
  employeePensionPct: 6,
  employerPensionPct: 6.5,
  severancePct: 8.33,
  employeeType: 'standard',
};

export default function PayrollCalculatorPage() {
  const [form, setForm] = useState(DEFAULT);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function calculate() {
    setLoading(true);
    try {
      const r = await fetch('/api/payroll-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, grossCash: Number(form.grossCash), creditPoints: Number(form.creditPoints), shoviRechev: Number(form.shoviRechev), employeePensionPct: Number(form.employeePensionPct), employerPensionPct: Number(form.employerPensionPct), severancePct: Number(form.severancePct) }),
      });
      setResult(await r.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">מחשבון שכר ישראלי 2026</h1>
          <p className="text-slate-500 text-sm mt-1">ברוטו → נטו | מדרגות מס 2026 (תיקון 288) | ביטוח לאומי (תיקון 252) | זיכוי 45א</p>
        </div>

        {/* Inputs */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="שכר ברוטו (₪/חודש)" value={form.grossCash} onChange={v => set('grossCash', v)} type="number" />
          <Field label="נקודות זיכוי" value={form.creditPoints} onChange={v => set('creditPoints', v)} type="number" step="0.25"
            hint="גבר תושב: 2.25 | אישה: 2.75 | עולה חדש: 5.25" />
          <Field label="שווי רכב (₪/חודש)" value={form.shoviRechev} onChange={v => set('shoviRechev', v)} type="number"
            hint="השפעה: מגדיל את בסיס המס אך לא משכר הנטו" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריית עובד</label>
            <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={form.employeeType} onChange={e => set('employeeType', e.target.value)}>
              <option value="standard">עובד רגיל (18 עד גיל פרישה)</option>
              <option value="under18">מתחת לגיל 18</option>
              <option value="pensioner">פנסיונר (מקבל קצבה)</option>
            </select>
          </div>
          <Field label="פנסיה עובד (%)" value={form.employeePensionPct} onChange={v => set('employeePensionPct', v)} type="number" step="0.5" hint="מינימום חוקי 6%" />
          <Field label="פנסיה מעסיק (%)" value={form.employerPensionPct} onChange={v => set('employerPensionPct', v)} type="number" step="0.5" hint="בד״כ 6.5%" />
          <Field label="פיצויים (%)" value={form.severancePct} onChange={v => set('severancePct', v)} type="number" step="0.01" hint="חוק: 8.33%" />
        </div>

        <button onClick={calculate} disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60">
          {loading ? 'מחשב...' : 'חשב שכר'}
        </button>

        {result && <Results data={result} />}

        <div className="text-xs text-slate-400 text-center pb-4">
          מחשבון זה מבוסס על תקנות 2026 (תיקון 288 למס הכנסה, תיקון 252 לביטוח לאומי). אינו מהווה ייעוץ מקצועי.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', step, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({ label, value, sub, bold, green, red, border }) {
  return (
    <div className={`flex justify-between items-center py-2 ${border ? 'border-t border-slate-200 mt-1 pt-3' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-bold' : ''} ${green ? 'text-emerald-600' : red ? 'text-red-600' : 'text-slate-700'}`}>
        {sub ? '-' : ''}{value} ₪
      </span>
    </div>
  );
}

function Results({ data }) {
  const { input, tax, ni, pension, result } = data;
  return (
    <div className="space-y-4">
      {/* Main result */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
        <p className="text-slate-600 text-sm mb-1">שכר נטו לתשלום</p>
        <p className="text-4xl font-bold text-emerald-700">₪{fmt(result.netCash)}</p>
        <p className="text-slate-500 text-xs mt-1">מתוך ברוטו ₪{fmt(input.grossCash)}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Tax breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">מס הכנסה</h3>
          {input.shoviRechev > 0 && (
            <Row label="בסיס למס (כולל שווי רכב)" value={fmt(input.taxableGross)} />
          )}
          <Row label="מס ברוטו (לפי מדרגות)" value={fmt(tax.grossTax)} red />
          <Row label={`זיכוי נקודות (${input.creditPoints} × ₪242)`} value={fmt(tax.creditPointsDeduction)} green />
          <Row label="זיכוי 45א (פנסיה)" value={fmt(tax.pensionCredit)} green />
          <Row label="מס הכנסה לתשלום" value={fmt(tax.incomeTax)} bold red border />
          <p className="text-xs text-slate-400 mt-2">שיעור מס אפקטיבי: {fmtN(tax.effectiveTaxRate)}%</p>
        </div>

        {/* NI breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">ביטוח לאומי ומס בריאות</h3>
          <Row label="בסיס מבוטח" value={fmt(ni.base)} />
          <Row label="חלק עובד (ב״ל + מס בריאות)" value={fmt(ni.employee)} red bold border />
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-400 font-medium mb-1">חלק מעסיק (לידיעה):</p>
            <Row label="ב״ל מעסיק" value={fmt(ni.employer)} />
          </div>
        </div>

        {/* Pension */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">פנסיה</h3>
          <Row label={`ניכוי עובד (${input.employeePensionPct}%)`} value={fmt(pension.employee)} red />
          <Row label="זיכוי מס 45א" value={fmt(pension.credit)} green />
          <p className="text-xs text-slate-400 mt-2">עלות פנסיה מעסיק: ₪{fmt(pension.employer)} | פיצויים: ₪{fmt(pension.severance)}</p>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">סיכום ניכויים</h3>
          <Row label="מס הכנסה" value={fmt(tax.incomeTax)} red />
          <Row label="ב״ל + בריאות (עובד)" value={fmt(ni.employee)} red />
          <Row label="פנסיה עובד" value={fmt(pension.employee)} red />
          <Row label="סה״כ ניכויים" value={fmt(result.totalDeductions)} bold red border />
          <Row label="שכר נטו" value={fmt(result.netCash)} bold green border />
          <div className="mt-3 pt-3 border-t border-slate-100">
            <Row label="עלות מעסיק כוללת" value={fmt(result.employerCost)} bold />
          </div>
        </div>
      </div>

      {/* Tax bracket table */}
      <details className="bg-white rounded-xl border border-slate-200 p-5">
        <summary className="font-semibold text-slate-700 cursor-pointer">מדרגות מס 2026 (תיקון 288)</summary>
        <table className="w-full text-sm mt-3">
          <thead><tr className="text-right text-slate-500 border-b">
            <th className="pb-1">מדרגה</th><th className="pb-1">הכנסה חודשית (₪)</th><th className="pb-1">שיעור</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {[
              ['1','0 – 7,010','10%'],
              ['2','7,011 – 10,060','14%'],
              ['3','10,061 – 19,000','20%'],
              ['4','19,001 – 25,100','31%'],
              ['5','25,101 – 46,690','35%'],
              ['6','46,691 – 60,130','47%'],
              ['7','60,131+','50%'],
            ].map(([n,r,p]) => (
              <tr key={n} className={input.taxableGross >= Number(r.split('–')[0].replace(/[,]/g,'').trim()) ? 'bg-blue-50' : ''}>
                <td className="py-1">{n}</td><td className="py-1">{r}</td><td className="py-1 font-mono">{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
