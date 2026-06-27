'use client';
import { useState } from 'react';

const fmt = (n) => n?.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—';
const fmtN = (n) => n?.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—';

const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const DEFAULT = {
  grossCash: 15000,
  creditPoints: 2.25,
  shoviRechev: 0,
  employeePensionPct: 6,
  employerPensionPct: 6.5,
  severancePct: 8.33,
  employeeType: 'standard',
  employeeName: '',
  companyName: '',
  period: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })(),
};

export default function PayrollCalculatorPage() {
  const [form, setForm] = useState(DEFAULT);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPayslip, setShowPayslip] = useState(false);

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
      setShowPayslip(false);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    setShowPayslip(true);
    setTimeout(() => window.print(), 150);
  }

  // Parse period for display
  const periodDisplay = (() => {
    if (!form.period) return '';
    const [y, m] = form.period.split('-');
    return `${MONTHS_HE[parseInt(m,10)-1]} ${y}`;
  })();

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Print-only CSS injected via style tag */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #payslip, #payslip * { visibility: visible; }
          #payslip { position: fixed; top: 0; right: 0; width: 100%; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">מחשבון שכר ישראלי 2026</h1>
          <p className="text-slate-500 text-sm mt-1">ברוטו → נטו | מדרגות מס 2026 (תיקון 288) | ביטוח לאומי (תיקון 252) | זיכוי 45א</p>
        </div>

        {/* Inputs */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Payslip metadata fields */}
          <Field label="שם חברה / מעסיק" value={form.companyName} onChange={v => set('companyName', v)} placeholder="לדוגמה: משרד עו״ד כהן ושות׳" />
          <Field label="שם עובד" value={form.employeeName} onChange={v => set('employeeName', v)} placeholder="שם מלא" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">תקופת שכר</label>
            <input
              type="month"
              value={form.period}
              onChange={e => set('period', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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

        {result && (
          <>
            <Results data={result} />
            <div className="flex gap-3">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm"
              >
                🖨️ הדפס תלוש
              </button>
              <button
                onClick={() => setShowPayslip(v => !v)}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold px-5 py-2.5 rounded-xl transition text-sm"
              >
                {showPayslip ? '🙈 הסתר תלוש' : '👁️ הצג תלוש'}
              </button>
            </div>

            {showPayslip && (
              <Payslip
                data={result}
                companyName={form.companyName}
                employeeName={form.employeeName}
                period={periodDisplay}
              />
            )}
          </>
        )}

        {/* Hidden payslip rendered for printing even when not shown in UI */}
        {result && !showPayslip && (
          <div className="hidden print:block">
            <Payslip
              data={result}
              companyName={form.companyName}
              employeeName={form.employeeName}
              period={periodDisplay}
            />
          </div>
        )}

        <div className="text-xs text-slate-400 text-center pb-4">
          מחשבון זה מבוסס על תקנות 2026 (תיקון 288 למס הכנסה, תיקון 252 לביטוח לאומי). אינו מהווה ייעוץ מקצועי.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', step, hint, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
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

// ─── Payslip (תלוש שכר) ──────────────────────────────────────────────────────

function PayslipRow({ label, value, bold, indent, separator, positive, negative }) {
  return (
    <>
      {separator && <tr><td colSpan={2} className="py-0"><div className="border-t border-slate-300 my-1" /></td></tr>}
      <tr className={bold ? 'font-bold bg-slate-50' : ''}>
        <td className={`py-1.5 text-sm border-b border-slate-100 ${indent ? 'pr-6' : ''}`}>{label}</td>
        <td className={`py-1.5 text-sm border-b border-slate-100 text-left font-mono ${positive ? 'text-emerald-700' : negative ? 'text-red-600' : 'text-slate-800'}`}>
          {positive && '+'}{negative && '-'}₪{value}
        </td>
      </tr>
    </>
  );
}

function Payslip({ data, companyName, employeeName, period }) {
  const { input, tax, ni, pension, result } = data;
  return (
    <div
      id="payslip"
      dir="rtl"
      className="bg-white border-2 border-slate-300 rounded-xl p-6 text-slate-800 font-sans"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {/* Header */}
      <div className="border-b-2 border-slate-400 pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{companyName || 'שם החברה'}</h2>
            <p className="text-sm text-slate-500 mt-0.5">תלוש שכר — {period || 'תקופה לא צוינה'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wider">עובד</p>
            <p className="text-base font-semibold">{employeeName || 'שם העובד'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Employee deductions */}
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th colSpan={2} className="text-right text-xs font-semibold uppercase tracking-wider text-white bg-slate-700 px-3 py-1.5 rounded-t">
                  הכנסות וניכויים
                </th>
              </tr>
            </thead>
            <tbody>
              {/* הכנסות */}
              <tr className="bg-slate-100"><td colSpan={2} className="text-xs font-bold text-slate-600 py-1 pr-1">הכנסות</td></tr>
              <PayslipRow label="שכר בסיס" value={fmt(input.grossCash)} indent positive />
              {input.shoviRechev > 0 && (
                <PayslipRow label="שווי רכב" value={fmt(input.shoviRechev)} indent positive />
              )}
              <PayslipRow label='סה"כ ברוטו' value={fmt(input.taxableGross ?? input.grossCash)} bold positive />

              {/* ניכויים */}
              <tr className="bg-slate-100"><td colSpan={2} className="text-xs font-bold text-slate-600 py-1 pr-1 pt-3">ניכויים</td></tr>
              <PayslipRow label="מס הכנסה" value={fmt(tax.incomeTax)} indent negative />
              <PayslipRow label='ביטוח לאומי + מס בריאות' value={fmt(ni.employee)} indent negative />
              <PayslipRow label={`ניכוי פנסיה (${input.employeePensionPct}%)`} value={fmt(pension.employee)} indent negative />
              <PayslipRow label='סה"כ ניכויים' value={fmt(result.totalDeductions)} bold negative separator />

              {/* נטו */}
              <tr className="bg-emerald-50">
                <td className="py-2 text-sm font-bold text-emerald-800 border-t-2 border-emerald-400">שכר נטו לתשלום</td>
                <td className="py-2 text-sm font-bold text-emerald-800 border-t-2 border-emerald-400 text-left font-mono">
                  ₪{fmt(result.netCash)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right: Employer portion */}
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th colSpan={2} className="text-right text-xs font-semibold uppercase tracking-wider text-white bg-slate-600 px-3 py-1.5 rounded-t">
                  חלק מעסיק (לידיעה)
                </th>
              </tr>
            </thead>
            <tbody>
              <PayslipRow label={`פנסיה מעסיק (${input.employerPensionPct}%)`} value={fmt(pension.employer)} />
              <PayslipRow label={`פיצויים (${input.severancePct}%)`} value={fmt(pension.severance)} />
              <PayslipRow label='ביטוח לאומי מעסיק' value={fmt(ni.employer)} />
              <tr className="bg-slate-100">
                <td className="py-2 text-sm font-bold text-slate-800 border-t-2 border-slate-400">עלות מעסיק כוללת</td>
                <td className="py-2 text-sm font-bold text-slate-800 border-t-2 border-slate-400 text-left font-mono">
                  ₪{fmt(result.employerCost)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Summary box */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">שיעור מס אפקטיבי:</span>
              <span className="font-mono font-semibold">{fmtN(tax.effectiveTaxRate)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">זיכוי נקודות זיכוי:</span>
              <span className="font-mono font-semibold">₪{fmt(tax.creditPointsDeduction)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">זיכוי 45א (פנסיה):</span>
              <span className="font-mono font-semibold">₪{fmt(tax.pensionCredit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-300 mt-5 pt-3 text-center text-xs text-slate-400">
        תלוש זה הופק ע&quot;י מחשבון שכר | אינו מסמך חשבונאי רשמי
      </div>
    </div>
  );
}
