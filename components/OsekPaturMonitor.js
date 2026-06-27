'use client';

const OSEK_PATUR_THRESHOLD_2026 = 122833;

const fmt = (n) =>
  n?.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—';

export default function OsekPaturMonitor({ yearlyRevenue = 0, year = 2026 }) {
  const threshold = OSEK_PATUR_THRESHOLD_2026;
  const pct = Math.min((yearlyRevenue / threshold) * 100, 110); // cap bar at 110%
  const actualPct = (yearlyRevenue / threshold) * 100;
  const remaining = Math.max(threshold - yearlyRevenue, 0);

  // Calculate months elapsed and remaining in the year
  const now = new Date();
  const currentYear = now.getFullYear();
  const isCurrentYear = year === currentYear;
  const monthsElapsed = isCurrentYear
    ? now.getMonth() + (now.getDate() / new Date(currentYear, now.getMonth() + 1, 0).getDate())
    : 12;
  const monthsRemaining = isCurrentYear ? 12 - monthsElapsed : 0;

  // Projected year-end revenue
  const projectedRevenue =
    monthsElapsed > 0 ? (yearlyRevenue / monthsElapsed) * 12 : yearlyRevenue;
  const projectedPct = (projectedRevenue / threshold) * 100;

  // Determine color level
  let barColor, bgColor, borderColor, badgeColor, badgeText;
  if (actualPct > 100) {
    barColor = 'bg-purple-600';
    bgColor = 'bg-purple-50';
    borderColor = 'border-purple-200';
    badgeColor = 'bg-purple-100 text-purple-800';
    badgeText = 'חובה לעבור לעוסק מורשה';
  } else if (actualPct > 90) {
    barColor = 'bg-red-500';
    bgColor = 'bg-red-50';
    borderColor = 'border-red-200';
    badgeColor = 'bg-red-100 text-red-800';
    badgeText = 'קרוב מאוד לתקרה!';
  } else if (actualPct > 70) {
    barColor = 'bg-amber-500';
    bgColor = 'bg-amber-50';
    borderColor = 'border-amber-200';
    badgeColor = 'bg-amber-100 text-amber-800';
    badgeText = 'שים לב לתקרה';
  } else {
    barColor = 'bg-emerald-500';
    bgColor = 'bg-emerald-50';
    borderColor = 'border-emerald-200';
    badgeColor = 'bg-emerald-100 text-emerald-800';
    badgeText = 'בטווח הבטוח';
  }

  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl p-5`} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">מוניטור עוסק פטור {year}</h3>
          <p className="text-xs text-slate-500 mt-0.5">תקרה: ₪{fmt(threshold)}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeColor}`}>
          {badgeText}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>₪{fmt(yearlyRevenue)} ({actualPct.toFixed(1)}%)</span>
          <span>תקרה: ₪{fmt(threshold)}</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div
            className={`${barColor} h-3 rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        {/* 70% and 90% markers */}
        <div className="relative h-2 mt-0.5">
          <div className="absolute" style={{ right: '30%', transform: 'translateX(50%)' }}>
            <div className="w-px h-2 bg-amber-400" />
          </div>
          <div className="absolute" style={{ right: '10%', transform: 'translateX(50%)' }}>
            <div className="w-px h-2 bg-red-400" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-0.5">
          <span>0%</span>
          <span className="text-amber-500">70%</span>
          <span className="text-red-500">90%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="bg-white rounded-lg py-2 px-1 border border-slate-100">
          <div className="font-bold text-slate-800 text-base">₪{fmt(remaining)}</div>
          <div className="text-slate-500 mt-0.5">נותר עד תקרה</div>
        </div>
        {isCurrentYear && (
          <>
            <div className="bg-white rounded-lg py-2 px-1 border border-slate-100">
              <div className="font-bold text-slate-800 text-base">{Math.ceil(monthsRemaining)}</div>
              <div className="text-slate-500 mt-0.5">חודשים שנותרו</div>
            </div>
            <div className={`rounded-lg py-2 px-1 border ${projectedPct > 100 ? 'bg-purple-100 border-purple-200' : projectedPct > 90 ? 'bg-red-100 border-red-200' : 'bg-white border-slate-100'}`}>
              <div className={`font-bold text-base ${projectedPct > 100 ? 'text-purple-700' : projectedPct > 90 ? 'text-red-700' : 'text-slate-800'}`}>
                ₪{fmt(Math.round(projectedRevenue))}
              </div>
              <div className="text-slate-500 mt-0.5">תחזית שנתית</div>
            </div>
          </>
        )}
        {!isCurrentYear && (
          <div className="col-span-2 bg-white rounded-lg py-2 px-1 border border-slate-100">
            <div className="font-bold text-slate-800 text-base">{actualPct.toFixed(1)}%</div>
            <div className="text-slate-500 mt-0.5">מהתקרה</div>
          </div>
        )}
      </div>

      {/* Warning messages */}
      <div className="mt-3 space-y-1.5">
        {actualPct > 100 && (
          <div className="flex items-start gap-2 bg-purple-100 text-purple-800 rounded-lg px-3 py-2 text-xs">
            <span className="mt-0.5">🚨</span>
            <span>
              <strong>עברת את התקרה!</strong> חובה להירשם כעוסק מורשה בתוך 30 יום ממועד חריגה. צור קשר עם רואה החשבון מיידית.
            </span>
          </div>
        )}
        {actualPct > 90 && actualPct <= 100 && (
          <div className="flex items-start gap-2 bg-red-100 text-red-800 rounded-lg px-3 py-2 text-xs">
            <span className="mt-0.5">⚠️</span>
            <span>
              <strong>קרוב לתקרה!</strong> נותרו ₪{fmt(remaining)} בלבד. שקול פגישה עם רואה חשבון לתכנון מעבר לעוסק מורשה.
            </span>
          </div>
        )}
        {actualPct > 70 && actualPct <= 90 && (
          <div className="flex items-start gap-2 bg-amber-100 text-amber-800 rounded-lg px-3 py-2 text-xs">
            <span className="mt-0.5">📊</span>
            <span>
              עברת 70% מהתקרה. עקוב אחר הכנסותיך{isCurrentYear && monthsRemaining > 0 ? ` — נותרו ${Math.ceil(monthsRemaining)} חודשים השנה` : ''}.
            </span>
          </div>
        )}
        {isCurrentYear && projectedPct > 100 && actualPct <= 100 && (
          <div className="flex items-start gap-2 bg-orange-100 text-orange-800 rounded-lg px-3 py-2 text-xs">
            <span className="mt-0.5">📈</span>
            <span>
              <strong>תחזית חריגה:</strong> בקצב הנוכחי צפויה הכנסה של ₪{fmt(Math.round(projectedRevenue))} עד סוף השנה — מעל התקרה.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
