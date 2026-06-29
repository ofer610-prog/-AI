# CLAUDE.md — הנחיות קבועות למערכת ניהול משרד עו"ד

## חוקי ברזל

1. **אסור שהאתר יקרוס** — לפני כל דחיפה: `npx next build` חייב לעבור
2. **BANK_ID ו-BANK_PASSWORD** — אסור ב-Vercel. רק ב-GitHub Secrets + GitHub Actions
3. **ענף פיתוח**: `claude/r-setup-ZdGlI` → PR → merge ל-`main`
4. **תשובות בעברית** — תמיד
5. **קישורים** — תמיד בתוך code block

## מנוע הסריקה (SINGLE SOURCE OF TRUTH)

**קרא את הסקיל לפני כל שינוי בסריקה:**
→ `.claude/skills/scan-engine.md`

**כלל ברזל**: שינויי כללי סריקה → רק ב-`lib/scanEngine.js`

## טכנולוגיה

- Next.js 14 App Router, `force-dynamic` pages
- Supabase (project: `pjefvenbcpkufunubpxz`)
- Vercel (production: `https://ai-rosy-theta.vercel.app`)
- Microsoft Graph API / Outlook OAuth לסריקת מיילים
- Gmail API לסריקת גוגל
- SWC minifier: **אין להשתמש במשתנה בשם זהה בscope שונה** (גורם ReferenceError ב-production)

## DB — expense_documents status values
`pending` | `approved` | `rejected` | `linked` | `needs_review` | `duplicate_review` | `imported` | `removed`

## עדיפויות המשתמש
1. אוטומציה מקסימלית — מה שניתן אוטומטית, אל תשלח לסיווג
2. אל תאחסן ספאם בDB — אם לא בטוח, עדיף skip מאשר review
3. `status='ignored'` במקום DELETE — כדי ש-message IDs ישמרו כ-dedup guard
