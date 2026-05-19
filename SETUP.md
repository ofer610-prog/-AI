# מדריך פריסה — מערכת ספרי משרד

## סקירה כללית

המערכת בנויה משלושה שירותים שמתחברים ביחד:
- **Vercel** — מארח את האפליקציה (chinami)
- **Supabase** — מסד נתונים + אימות (חינמי עד 500MB)
- **Google Cloud** — Gmail API (חינמי)
- **Anthropic API** — היועץ AI (~$10-30/חודש לפי שימוש)
- **Resend** — שליחת מיילים (חינמי עד 3,000 מיילים/חודש)

זמן פריסה משוער: **כשעה וחצי**, גם אם זה הפעם הראשונה.

---

## שלב 1: יצירת חשבונות (~10 דקות)

### 1.1 GitHub
אם אין לך — `github.com` → Sign up

### 1.2 Vercel
1. גש ל-`vercel.com` → Sign up
2. **בחר Sign up with GitHub** — זה יחבר אוטומטית

### 1.3 Supabase
1. גש ל-`supabase.com` → Start your project
2. הירשם דרך GitHub
3. צור פרויקט חדש:
   - **Name:** `lawfirm-bookkeeping`
   - **Database Password:** צור סיסמה חזקה ושמור אותה (חשוב!)
   - **Region:** Frankfurt או Stockholm (קרוב ביותר לישראל)
   - **Plan:** Free
4. המתן 2-3 דקות עד שהפרויקט קם

### 1.4 Anthropic
1. גש ל-`console.anthropic.com` → Sign up
2. הוסף אמצעי תשלום (אין חיוב חודשי, רק לפי שימוש)
3. צור API key — שמור אותו

### 1.5 Resend
1. גש ל-`resend.com` → Sign up
2. צור API key
3. (אופציונלי לעת עתה) — אימות דומיין משלך

### 1.6 Google Cloud
1. גש ל-`console.cloud.google.com`
2. הירשם (אם לא רשום)
3. צור פרויקט חדש: **New Project** → שם: `lawfirm-gmail`
4. ב-Search למעלה: חפש **Gmail API** → לחץ Enable
5. תפריט שמאל → **APIs & Services** → **OAuth consent screen**:
   - User Type: **External** → Create
   - App name: `Lawfirm Bookkeeping`
   - User support email: שלך
   - Developer contact: שלך
   - Save and Continue
   - Scopes: Add or Remove → חפש `gmail.readonly` ו-`gmail.modify` → Update
   - Test users: הוסף את כל המיילים שיתחברו (שלך, של עו"ד, של מתמחה)
   - Save and Continue
6. תפריט שמאל → **Credentials** → Create Credentials → **OAuth client ID**:
   - Type: **Web application**
   - Name: `Lawfirm App`
   - Authorized redirect URIs: **תוסיף לאחר פריסה ל-Vercel** (נחזור לזה)
   - Create — תקבל **Client ID** ו-**Client secret** — שמור!

---

## שלב 2: הקמת מסד הנתונים ב-Supabase (~10 דקות)

1. ב-Supabase Dashboard → תפריט שמאל → **SQL Editor** → **New query**
2. העתק את כל התוכן של `supabase/schema.sql` והדבק
3. לחץ **Run**
4. אמור להופיע "Success. No rows returned"

### יצירת המשרד הראשון
ב-SQL Editor הרץ (החלף את "שם המשרד שלך"):
```sql
INSERT INTO organizations (name) VALUES ('שם המשרד שלך')
RETURNING id;
```
**שמור את ה-id שחוזר** — תצטרך אותו!

### יצירת Storage Buckets
תפריט שמאל → **Storage** → **New bucket**:
- שם: `documents` → **Private** → Create
- שם: `exports` → **Private** → Create

### Settings — הוצאת Keys
תפריט שמאל → **Settings (גלגל שיניים)** → **API**. שמור:
- `Project URL` = `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key = `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role secret` key = `SUPABASE_SERVICE_ROLE_KEY` (סודי מאוד!)

---

## שלב 3: העלאה ל-GitHub (~5 דקות)

ב-Terminal בתיקיית הפרויקט:

```bash
# התקנה ראשונית
npm install

# יצירת repo ב-GitHub
# גש ל-github.com → New repository → שם: lawfirm-app → Private → Create

# חיבור הקוד ל-GitHub (החלף YOUR_USERNAME)
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lawfirm-app.git
git push -u origin main
```

---

## שלב 4: פריסה ל-Vercel (~10 דקות)

1. `vercel.com/dashboard` → **Add New** → **Project**
2. בחר את ה-repo `lawfirm-app` → Import
3. **Framework Preset**: Next.js (זוהה אוטומטית)
4. הרחב **Environment Variables** — הוסף את הבאים:

```
NEXT_PUBLIC_SUPABASE_URL          [מ-Supabase]
NEXT_PUBLIC_SUPABASE_ANON_KEY     [מ-Supabase]
SUPABASE_SERVICE_ROLE_KEY         [מ-Supabase]
ANTHROPIC_API_KEY                 [מ-Anthropic]
GOOGLE_CLIENT_ID                  [מ-Google Cloud]
GOOGLE_CLIENT_SECRET              [מ-Google Cloud]
GOOGLE_REDIRECT_URI               [נשלים אחרי הפריסה]
RESEND_API_KEY                    [מ-Resend]
RESEND_FROM_EMAIL                 onboarding@resend.dev
CRON_SECRET                       [צור מחרוזת אקראית של 32+ תווים]
NEXT_PUBLIC_APP_URL               [נשלים אחרי הפריסה]
```

5. לחץ **Deploy**
6. המתן 2-3 דקות עד שהפריסה תסתיים
7. תקבל URL כמו `lawfirm-app-xxx.vercel.app`. **שמור אותו!**

### עדכון URLs

חזור ל-**Vercel Settings → Environment Variables** ועדכן:
- `NEXT_PUBLIC_APP_URL` = `https://lawfirm-app-xxx.vercel.app`
- `GOOGLE_REDIRECT_URI` = `https://lawfirm-app-xxx.vercel.app/api/auth/google/callback`

עדכן גם ב-Google Cloud Console → Credentials → ה-OAuth client → **Authorized redirect URIs** — הוסף את ה-URL הנ"ל.

לחץ **Redeploy** ב-Vercel.

---

## שלב 5: יצירת המשתמש הראשון (אדמין) (~5 דקות)

1. גש ל-`https://lawfirm-app-xxx.vercel.app`
2. לחץ "אין לך חשבון? הרשם"
3. הזן את האימייל והסיסמה שלך
4. תקבל מייל אישור — לחץ עליו

### הפיכת המשתמש לאדמין

חזור ל-Supabase → **Table Editor** → **profiles**:
- אם הרשומה לא נוצרה אוטומטית, צור אותה:
  - `id` = ה-user.id מ-auth.users (תפריט: Authentication → Users → העתק UUID)
  - `organization_id` = ה-id של המשרד שיצרת
  - `full_name` = שמך
  - `email` = האימייל שלך
  - `role` = `admin`

עכשיו תוכל להיכנס ולראות את כל המערכת.

---

## שלב 6: חיבור Gmail (~3 דקות)

1. במערכת → **לשונית "מייל"**
2. לחץ "חבר Gmail"
3. תופנה לגוגל — בחר את חשבון המשרד
4. תופיע אזהרה "Google hasn't verified this app" — לחץ:
   - **Advanced** (קישור קטן בפינה)
   - **Go to Lawfirm Bookkeeping (unsafe)**
5. אשר את ההרשאות
6. תוחזר למערכת — Gmail מחובר!

---

## שלב 7: הוספת עובדים נוספים (~5 דקות לכל אחד)

1. כל עובד נכנס ל-`https://lawfirm-app-xxx.vercel.app` ונרשם
2. אתה (אדמין) נכנס ל-Supabase → Table Editor → profiles → מוצא את הרשומה החדשה
3. מעדכן את `organization_id` שלו לזה של המשרד
4. בוחר תפקיד מתאים: `lawyer` / `paralegal` / `intern` / `accountant`

---

## שלב 8: טעינת המערכת (~30 דקות)

1. **הגדרות:** הזן את שם המשרד, שיעור מע"מ, תדירות דיווח
2. **צוות:** בדוק שכל העובדים מופיעים, הוסף שכר ותעריף שעתי
3. **לקוחות:** הוסף 5-10 לקוחות פעילים
4. **תיקים:** צור תיקים לכל לקוח עם שכ"ט מוסכם
5. **חיבור Gmail:** מומלץ לתת לסנכרון לרוץ פעם ראשונה — לחץ "סנכרון עכשיו"
6. **בדוק את הקוקפיט** — השאל את היועץ AI שאלה ראשונה

---

## פתרון בעיות

### "RLS policy violation"
המשתמש לא קושר נכון ל-organization. בדוק את הטבלה profiles ב-Supabase.

### Gmail OAuth נכשל
- ודא שה-redirect URI ב-Google Cloud זהה לחלוטין לזה שב-Vercel ENV
- ודא שהמשתמש מופיע ב-"Test users" ב-OAuth consent screen

### Cron לא רץ
- Vercel Free נותן רק job ביום אחד — וזה מספיק לדרישה שלך
- בדוק ב-Vercel → Cron Jobs שה-job פעיל
- בדוק ב-Vercel → Logs את ה-output שלו

### "Anthropic API error: insufficient_quota"
הוסף אמצעי תשלום ב-Anthropic Console.

---

## עלויות חודשיות צפויות

- Vercel Free: ₪0
- Supabase Free: ₪0 (עד שתעבור 500MB DB או 50K rows — יעבור הרבה זמן)
- Google Cloud Gmail API: ₪0
- Resend Free: ₪0 (עד 3,000 מיילים)
- Anthropic API: 30-100 ₪ (תלוי בכמה משתמשים בצ'אט וכמה מיילים מסונכרנים)

**סה"כ: 30-100 ₪/חודש**

---

## מה הלאה

אחרי שהמערכת רצה כמה שבועות, תרצה להוסיף:

1. **דומיין משלך** — yourfirm.co.il במקום .vercel.app
2. **Google Verification** — להעלים את אזהרת "unsafe" (לוקח 4-6 שבועות, חינם)
3. **Email custom** — אימות דומיין ב-Resend כדי לשלוח מ-`reports@yourfirm.co.il`
4. **גיבויים** — Supabase Pro ($25/חודש) — מומלץ מאוד אחרי שיש נתונים אמיתיים
5. **2FA** — Supabase תומך, צריך רק לאפשר ב-Settings

---

## שאלות?

המערכת מתועדת בקוד עצמו. כל קובץ ב-`lib/` עם הערות בעברית.

בהצלחה!
