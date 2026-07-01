# CLAUDE.md — הנחיות קבועות למערכת ניהול משרד עו"ד

מסמך זה מספק ל-Claude Code הנחיות עבודה על הקוד בריפו הזה.

## חוקי ברזל

1. **אסור שהאתר יקרוס** — לפני כל דחיפה: `npx next build` חייב לעבור
2. **BANK_ID ו-BANK_PASSWORD** — אסור ב-Vercel. רק ב-GitHub Secrets + GitHub Actions
3. **ענף פיתוח**: `claude/r-setup-ZdGlI` → PR → merge ל-`main`
4. **תשובות בעברית** — תמיד
5. **קישורים** — תמיד בתוך code block

## מנוע הסריקה (SINGLE SOURCE OF TRUTH)

**קרא את הסקיל לפני כל שינוי בסריקה:**
→ `.claude/skills/scan-engine.md`

**כלל ברזל**: שינויי כללי סריקה → רק ב-`lib/scanEngine.js`. לעולם לא ב-`lib/expenseGmailScan.js` / `lib/expenseOutlookScan.js` (אלה רק שולפים מיילים וקוראים ל-`decide()`).

## טכנולוגיה

- Next.js 14 App Router, `force-dynamic` pages, alias `@/*` → שורש הריפו (`jsconfig.json`)
- Supabase (project: `pjefvenbcpkufunubpxz`) — Postgres + Auth + Storage + RLS
- Vercel (production: `https://ai-rosy-theta.vercel.app`) — Hobby plan, cron **פעם ביום בלבד** לכל job
- Microsoft Graph API / Outlook OAuth לסריקת מיילים
- Gmail API לסריקת גוגל
- Anthropic Claude API — יועץ AI, סיווג מיילים, OCR קבלות
- Playwright + `israeli-bank-scrapers` (ב-`scripts/`, רץ רק ב-GitHub Actions, לא תלות של האפליקציה עצמה)
- SWC minifier: **אין להשתמש במשתנה בשם זהה בscope שונה** (גורם ReferenceError ב-production)
- **אין test suite** בפרויקט — הבדיקה היחידה היא `npx next build` + בדיקה ידנית

## פקודות פיתוח

```bash
npm install          # התקנת תלויות
npm run dev           # שרת פיתוח (localhost:3000)
npm run build         # חייב לעבור לפני כל push — זה ה"טסט" של הפרויקט
npm run lint          # eslint-config-next
```

לסקריפטים ב-`scripts/` (Playwright — Cligal + סריקת בנק) יש `package.json` נפרד:
```bash
cd scripts && npm install
```

## ארכיטקטורה — מבנה כללי

```
app/                  Next.js App Router
  api/                ~110 route.js — REST endpoints
  <feature>/page.js    דפי UI (dashboard, cases, finance, collection, tax, staff, time...)
  layout.js            RTL (dir="rtl", lang="he"), גופנים עבריים, עוטף NotificationBell / AppNav / Google-Outlook connect widgets

components/            רכיבי React משותפים (client components) — AppNav, DashboardClient, TimeTracker, PinGate, NotificationBell...

lib/                   כל לוגיקת השרת/עסקית, לא-UI
  scanEngine.js         SSOT לכללי סריקת הוצאות (ראה סקיל למעלה)
  expenseGmailScan.js / expenseOutlookScan.js   שליפת מיילים, קוראים ל-decide()
  supabase/client.js    Supabase client לצד לקוח (browser)
  supabase/server.js    createClient() (session-aware) + createServiceClient() (service-role) + getSessionUser()
  adminAuth.js          getProfile() / requireAdmin() — הרשאות admin/accountant ל-API routes פיננסיים
  pinAuth.js            PIN auth נפרד (לא Supabase session) למודול /cases — validatePin(), getOrgId() (מודל single-org)
  security.js           הגנת prompt-injection (buildSafePrompt/sanitizeForPrompt), validateCronSecret(), audit log builder
  helpers.js            פורמט תאריכים/כסף (עברית, אזור זמן ישראל), MATTER_TYPES, ROLE_LABELS, תחזיות מס
  notifications.js, googleCalendar.js, gdrive.js/drive.js, gmail.js, outlookClient.js, whatsapp-scan.js, accountantReport.js, casesImport.js/casesBackup.js, sync.js
  skills/               ~17 קבצי SKILL.md עצמאיים (ייעוץ מס/הנה"ח ישראלי) — **אינם מחוברים לקוד האפליקציה**, מסמכי עזר/reference בלבד

supabase/
  schema.sql            הסכימה המלאה (organizations, profiles, clients, matters, income, expense, invoices, timesheet, bank_transactions, gmail_processed, alerts, chat_messages, audit_log)
  migrations/            שינויי סכימה נקודתיים מאז ה-schema.sql הבסיסי (7 קבצים — accounting, whatsapp_alerts, bank_invoice_match, events, payment_events)

scripts/                כלים עצמאיים שרצים רק ב-GitHub Actions (לא חלק מ-build של Next):
  scrape-cligal.js       Playwright — מסנכרן חשבוניות Cligal
  scrape-bank.js         Playwright + israeli-bank-scrapers — עדכון תנועות בנק (מושבת כברירת מחדל, ראה למטה)
  create-cligal-draft.js יצירת טיוטת חשבונית ב-Cligal
  import.mjs             ייבוא נתונים חד-פעמי

middleware.js           הגנת נתיבים: לא-מחובר + לא-public (`/login`, `/api/*`, `/`) → redirect ל-/login
```

## אימות והרשאות — שלוש שכבות שונות

1. **Supabase session** (עוגיות, דרך `@supabase/ssr`) — משתמשי הממשק הרגילים. `middleware.js` חוסם דפים לא-ציבוריים; `lib/supabase/server.js` נותן `getSessionUser()`.
2. **PIN נפרד** (`lib/pinAuth.js`) — מודול `/cases` נגיש גם ללא Supabase session, דרך PIN (נבדק מול `integration_settings` בטבלה או env `CASES_ACCESS_PIN`).
3. **CRON_SECRET Bearer token** (`lib/security.js:validateCronSecret`) — כל `/api/cron/*` ו-endpoints שנקראים מ-GitHub Actions נבדקים מול `Authorization: Bearer $CRON_SECRET`, לא מול session.

הרשאות תפקיד: `lib/adminAuth.js:requireAdmin()` — endpoints פיננסיים חייבים admin/accountant בלבד (עובד רגיל לא מקבל דוחות כספיים מהשרת). תפקידים: `admin` / `lawyer` / `paralegal` / `intern` / `accountant` (`ROLE_LABELS` ב-`lib/helpers.js`).

## אוטומציה — Vercel Cron מול GitHub Actions

Vercel Hobby מאפשר רק job **יומי** אחד לכל cron (`vercel.json`) — כל מה שצריך תדירות גבוהה יותר עובר ל-GitHub Actions (`.github/workflows/`) שקורא ל-API עם `CRON_SECRET`:

| תדירות | מנגנון | דוגמאות |
|--------|---------|----------|
| יומי | Vercel cron (`vercel.json`) | daily-sync, morning-briefing, invoice-reminders, evening-summary, attorney-digest, backup-cases, sync-calendar, sync-gdrive, scan-gmail/scan-outlook (3×/יום) |
| כל 10 דקות | GitHub Actions (`auto-sync.yml`) | סנכרון Excel מ-Drive → DB |
| כל שעה | GitHub Actions (`event-reminders.yml`) | תזכורות WhatsApp ללקוחות 24h לפני אירוע |
| כל 6 שעות | GitHub Actions (`sync-cligal.yml`) | Playwright scraper לחשבוניות Cligal |
| חודשי | GitHub Actions (`monthly-accountant-report.yml`) | דוח הוצאות לרו"ח |
| ידני בלבד | GitHub Actions `workflow_dispatch` (`sync-bank.yml`, `create-cligal-draft.yml`) | סריקת בנק (**מושבתת כברירת מחדל** — מדיניות אבטחה: אין schedule אוטומטי; המשרד מעלה קובץ עו"ש ידנית דרך `/finance` → `/api/bank/import-csv`) |

Push ל-`main` מפעיל גם `deploy-vercel.yml` (deploy מקביל לאינטגרציית ה-Git הרגילה של Vercel).

## אבטחה — תוכן חיצוני ל-AI

`lib/security.js` הוא ה-SSOT להגנה מפני prompt injection: כל תוכן חיצוני (מייל, הודעת WhatsApp, קובץ) שמוזן לפרומפט של Claude **חייב** לעבור דרך `buildSafePrompt()` / `sanitizeForPrompt()` — לעולם לא לשרשר תוכן חיצוני ישירות לפרומפט המערכת. `containsIdentityClaim()` מסמן טענות זהות לא-מאומתות בהודעות WhatsApp נכנסות.

## DB — expense_documents status values
`pending` | `approved` | `rejected` | `linked` | `needs_review` | `duplicate_review` | `imported` | `removed`

## עדיפויות המשתמש
1. אוטומציה מקסימלית — מה שניתן אוטומטית, אל תשלח לסיווג
2. אל תאחסן ספאם בDB — אם לא בטוח, עדיף skip מאשר review
3. `status='ignored'` במקום DELETE — כדי ש-message IDs ישמרו כ-dedup guard
