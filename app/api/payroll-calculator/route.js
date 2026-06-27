/**
 * POST /api/payroll-calculator
 * Israeli bruto→neto payroll calculator (2026 rates)
 * Sources: israeli-payroll-calculator skill, Amendment 288 (tax), Amendment 252 (NI)
 */
export const dynamic = 'force-dynamic';

// 2026 monthly tax brackets (Amendment 288, retroactive 1.1.2026)
const BRACKETS = [
  { limit: 7010,  rate: 0.10 },
  { limit: 10060, rate: 0.14 },
  { limit: 19000, rate: 0.20 },
  { limit: 25100, rate: 0.31 },
  { limit: 46690, rate: 0.35 },
  { limit: 60130, rate: 0.47 },
  { limit: Infinity, rate: 0.50 },
];

const CREDIT_POINT_VALUE = 242; // NIS/month (2026)

// Bituach Leumi 2026 (Amendment 252)
const NI_REDUCED_THRESHOLD = 7703;
const NI_REDUCED_EMPLOYEE = 0.0427; // 1.04% NI + 3.23% health
const NI_FULL_EMPLOYEE    = 0.1217; // 7.00% NI + 5.17% health
const NI_REDUCED_EMPLOYER = 0.0451;
const NI_FULL_EMPLOYER    = 0.076;
const NI_MAX_INSURABLE    = 51910;

// Pension credit (Section 45a, 2026)
const PENSION_CREDIT_SALARY_CEILING = 9700;
const PENSION_CREDIT_RATE           = 0.35;
const PENSION_CREDIT_PCT            = 0.07;

function calcTax(taxableGross) {
  let tax = 0;
  let prev = 0;
  for (const b of BRACKETS) {
    if (taxableGross <= prev) break;
    const slice = Math.min(taxableGross, b.limit) - prev;
    tax += slice * b.rate;
    prev = b.limit;
  }
  return tax;
}

function calcNI(base, employeeType = 'standard') {
  const insuredBase = Math.min(base, NI_MAX_INSURABLE);
  if (employeeType === 'under18' || employeeType === 'pensioner') {
    return { employee: 0, employer: calcNIEmployer(insuredBase) };
  }
  let employee = 0;
  if (insuredBase <= NI_REDUCED_THRESHOLD) {
    employee = insuredBase * NI_REDUCED_EMPLOYEE;
  } else {
    employee = NI_REDUCED_THRESHOLD * NI_REDUCED_EMPLOYEE +
               (insuredBase - NI_REDUCED_THRESHOLD) * NI_FULL_EMPLOYEE;
  }
  return { employee, employer: calcNIEmployer(insuredBase) };
}

function calcNIEmployer(insuredBase) {
  if (insuredBase <= NI_REDUCED_THRESHOLD) {
    return insuredBase * NI_REDUCED_EMPLOYER;
  }
  return NI_REDUCED_THRESHOLD * NI_REDUCED_EMPLOYER +
         (insuredBase - NI_REDUCED_THRESHOLD) * NI_FULL_EMPLOYER;
}

export async function POST(request) {
  const body = await request.json();
  const {
    grossCash         = 0,      // bruto cash salary NIS/month
    creditPoints      = 2.25,   // nekudot zikui
    shoviRechev       = 0,      // company car use value NIS/month
    employeePensionPct= 6,      // employee pension %
    employerPensionPct= 6.5,    // employer pension %
    severancePct      = 8.33,   // tzva'at pitzuyin %
    employeeType      = 'standard', // standard | under18 | pensioner
  } = body;

  const gross = Number(grossCash);
  const shovi = Number(shoviRechev);
  const taxableGross = gross + shovi;

  // ── Income Tax ──────────────────────────────────────────────────
  const grossTax = calcTax(taxableGross);
  const creditPointsDeduction = creditPoints * CREDIT_POINT_VALUE;

  // Pension tax credit (45a)
  const employeePension = gross * (Number(employeePensionPct) / 100);
  const insuredSalaryForCredit = Math.min(gross, PENSION_CREDIT_SALARY_CEILING);
  const eligiblePensionContrib = Math.min(employeePension, PENSION_CREDIT_PCT * insuredSalaryForCredit);
  const pensionCredit = PENSION_CREDIT_RATE * eligiblePensionContrib;

  const incomeTax = Math.max(0, grossTax - creditPointsDeduction - pensionCredit);

  // ── Bituach Leumi + Health ───────────────────────────────────────
  const ni = calcNI(taxableGross, employeeType);

  // ── Pension ─────────────────────────────────────────────────────
  const employerPension   = gross * (Number(employerPensionPct) / 100);
  const severanceReserve  = gross * (Number(severancePct) / 100);
  const employerNI        = ni.employer;

  // ── Net ─────────────────────────────────────────────────────────
  const totalDeductions = incomeTax + ni.employee + employeePension;
  const netCash = gross - totalDeductions;

  // ── Employer Cost ────────────────────────────────────────────────
  const employerCost = gross + employerNI + employerPension + severanceReserve;

  // ── Effective Rates ──────────────────────────────────────────────
  const effectiveTaxRate = taxableGross > 0 ? (incomeTax / taxableGross) * 100 : 0;
  const totalEmployeeRate = taxableGross > 0 ? (totalDeductions / gross) * 100 : 0;

  return Response.json({
    input: { grossCash: gross, shoviRechev: shovi, taxableGross, creditPoints, employeePensionPct, employerPensionPct, severancePct },
    tax: {
      grossTax: round(grossTax),
      creditPointsDeduction: round(creditPointsDeduction),
      pensionCredit: round(pensionCredit),
      incomeTax: round(incomeTax),
      effectiveTaxRate: round(effectiveTaxRate),
    },
    ni: {
      employee: round(ni.employee),
      employer: round(ni.employer),
      base: Math.min(taxableGross, NI_MAX_INSURABLE),
    },
    pension: {
      employee: round(employeePension),
      employer: round(employerPension),
      severance: round(severanceReserve),
      credit: round(pensionCredit),
    },
    result: {
      netCash: round(netCash),
      totalDeductions: round(totalDeductions),
      totalEmployeeDeductionRate: round(totalEmployeeRate),
      employerCost: round(employerCost),
    },
  });
}

function round(n) { return Math.round(n * 100) / 100; }
