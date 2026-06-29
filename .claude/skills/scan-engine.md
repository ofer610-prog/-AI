# Skill: מנוע סריקה של הוצאות — SINGLE SOURCE OF TRUTH

## מה זה?
כל הלוגיקה של סריקת מיילים (Gmail + Outlook) מרוכזת בקובץ אחד:
**`lib/scanEngine.js`**

**חוק ברזל**: כשמשהו לא עובד בסריקה — עורכים רק את `lib/scanEngine.js`.
לעולם לא עורכים את `lib/expenseGmailScan.js` או `lib/expenseOutlookScan.js` כדי לשנות כללי סינון/ספקים/סכומים.

---

## ארכיטקטורה

```
lib/scanEngine.js          ← הכללים (ספקים, סינון, חילוץ, החלטות)
lib/expenseGmailScan.js    ← שולף מיילים מ-Gmail, קורא ל-decide()
lib/expenseOutlookScan.js  ← שולף מיילים מ-Outlook, קורא ל-decide()

decide(email) → { action: 'auto_import' | 'review' | 'skip', ... }

auto_import → expense_documents (status='linked', ייבוא ישיר)
review      → gmail_processed (status='pending-review', תור לסיווג ידני)
skip        → לא נשמר כלל (message ID לא נשמר → יסרק שוב!)
```

---

## ה-Exports של scanEngine.js

| Export | תיאור |
|--------|--------|
| `decide(email)` | ההחלטה הראשית — מחזירה action/vendor/amount/vat/... |
| `SUPPLIERS` | רשימת ספקים מוכרים (הוסף כאן ספקים חדשים) |
| `SKIP_DOMAINS` | דומיינים שמסוננים לפני הכל |
| `SKIP_SUBJECT_KEYWORDS` | מילות נושא שמסוננות לפני הכל |
| `extractAmount(text)` | חילוץ סכום — מחזיר `{amount, strong}` |
| `extractVat(text, total, classification)` | חילוץ מע"מ |
| `stripHtml(html)` | נקיון HTML |
| `detectSupplier(haystackLow)` | זיהוי ספק |

---

## איך לבצע שינויים — לפי הוראת המשתמש

### 1. להוסיף ספק חדש (לדוגמה: "שירות X")
```js
// ב-lib/scanEngine.js, תחת export const SUPPLIERS = [
{ id: 'service_x', label: 'שירות X', category: 'office', section: 'office',
  patterns: ['servicex.co.il', 'שירות X', 'serviceX'] },
```
- `category` אפשרויות: `'office'`, `'transport'`, `'telecom'`, `'software'`, `'professional'`, `'salary'`, `'pension'`, `'insurance'`, `'rent'`
- `noAutoImport: true` — אם רוצים שגם עם סכום, יעבור לתור סיווג (לא ייובא אוטומטית)

### 2. להוסיף דומיין לסינון ספאם
```js
// ב-lib/scanEngine.js, תחת export const SKIP_DOMAINS = [
'spamsite.co.il',
```

### 3. להוסיף מילת נושא לסינון
```js
// ב-lib/scanEngine.js, תחת export const SKIP_SUBJECT_KEYWORDS = [
'מונח לסינון',
```

### 4. לשנות את גבול הייבוא האוטומטי (כרגע 50,000 ₪)
```js
const AUTO_IMPORT_MAX = 50_000; // שנה את הערך
```

---

## כללי ה-decide() — לפי סדר עדיפות

1. **SKIP_DOMAINS** — דומיין ספאם → skip
2. **SKIP_SUBJECT_KEYWORDS** — נושא שיווקי → skip
3. **SKIP_LEGAL_SUBJECTS** — מסמך הליך/תיק → skip
4. **detectSupplier + extractAmount** — זיהוי ספק וסכום
5. **isInvoiceLike** — האם כלל יש סימן פיננסי?
6. **החלטה**:
   - ספק מוכר + סכום תקין (עם מטבע/מילת-סך) + לא noAutoImport + לא > 50k → **auto_import**
   - ספק מוכר ללא סכום, או סכום ללא ספק, או noAutoImport → **review**
   - אחרת → **skip**

---

## חילוץ סכומים — כלל קריטי

**מבקשת מטבע או מילת-סך תמיד** (₪, ש"ח, NIS, "סה"כ", "לתשלום").
**לעולם לא** לוקחים מספר "חופשי" — זה יתפוס מספרי הזמנה, מספרי חשבונית, מספרי טלפון.

מספרים שנדחים אוטומטית:
- מספרים שלפניהם מילות מזהה (מספר, הזמנה, אסמכתא, invoice no, #, CRM, תיק)
- שנים (2020–2035) ללא עשרוני
- מעל 1,000,000 ₪

---

## טבלאות DB

### `expense_documents` — ייבוא אוטומטי + סיווג ידני
- `status` אפשרויות: `pending`, `approved`, `rejected`, `linked`, `needs_review`, `duplicate_review`, `imported`, `removed`
- `payer` אפשרויות: `office`, `client`, `unknown`
- `vat` — עמודת מע"מ (numeric, אפשרי null)

### `gmail_processed` — תור הסיווג
- `status` אפשרויות: `pending-review`, `approved`, `imported`, `ignored`, `linked`
- **ייבוא אוטומטי ← expense_documents** (לא כאן)
- **תור סיווג ← כאן** (עבור items שנדרש אימות ידני)

### כלל dedup
הסורקים בודקים **שתי הטבלאות** לפני הוספה — אם message_id קיים בכל אחת → מדולג.

---

## שגיאות נפוצות ופתרונות

| שגיאה | סיבה | פתרון |
|-------|-------|--------|
| "יובאו 0" | status check constraint חסם את ה-insert | migration: הרחב את constraint |
| מספר הזמנה = סכום | חילוץ ללא עוגן מטבע | extractAmount דורש CUR/TOTAL prefix |
| ספאם חוזר אחרי DELETE | message_id נמחק → dedup נכשל | תמיד UPDATE status='ignored' לא DELETE |
| "iCloud storage full" נכנס | לא היה בסינון | הוסף לSKIP_SUBJECT_KEYWORDS |
| ספק X לא מזוהה | לא ברשימת SUPPLIERS | הוסף ל-SUPPLIERS |

---

## בדיקה מהירה (run from repo root)
```bash
node -e "
import('/home/user/-AI/lib/scanEngine.js').then(({ decide }) => {
  console.log(decide({ subject: 'חשבונית מס', fromEmail: 'billing@cellcom.co.il', body: 'סה\"כ ₪150' }));
})
"
```

---

## רשימת BillyAI — יכולות שממומשות / בתכנון

| יכולת | מצב |
|-------|-----|
| סריקת Gmail | ✅ ממומש |
| סריקת Outlook/Hotmail | ✅ ממומש |
| מנוע אחד מאוחד | ✅ ממומש (scanEngine.js) |
| חילוץ ספק / סכום / תאריך | ✅ ממומש |
| חילוץ מע"מ (חשבונית מס) | ✅ ממומש |
| סיווג אוטומטי לקטגוריה | ✅ ממומש |
| ייבוא אוטומטי לספק מוכר | ✅ ממומש |
| תור סיווג לאימות ידני | ✅ ממומש |
| העלאת קבלה ידנית (OCR) | ✅ ממומש |
| דוחות חודשיים | ✅ ממומש |
| יצוא לרואה חשבון | ⬜ בתכנון |
| התאמה לתנועות כרטיס אשראי | ⬜ בתכנון |
| חיוב אוטומטי לתיקי לקוח | ⬜ בתכנון |
