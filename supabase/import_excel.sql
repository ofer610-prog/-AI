-- חלק א: ארגון וצוות
UPDATE organizations SET name = 'משרד עו"ד כהן-רוגוזינסקי' WHERE id = (SELECT id FROM organizations LIMIT 1);

INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'לידור', 'lawyer', 'לידור@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'פולינה', 'lawyer', 'פולינה@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'צופית', 'lawyer', 'צופית@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'עופר', 'admin', 'עופר@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;

-- חלק ב: לקוחות
INSERT INTO clients (organization_id, name, source) SELECT id, 'אשכר טליה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'סלק העברה ללא תמורה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'סלומני העברה ללא תמורה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'בירס -סולימני', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'סולימני - אחות בירס', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'רונן מני', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'משה זגזג', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'שחר סוזי וריקרדו-', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'אדלר דבורה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'חזן - אינגה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'ארבל אורן', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'הירש גבריאל וקטיה -', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'רונית שחר -', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'סגלי אמי אליזבטה - קורן', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'בן אברהם אליה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'איתן שוחט', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'קונובלנקו פבל- פארס סימון', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'נורדמן - יוסי אלפסי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'זר אביעד ונורית -', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'אלפסי יוסף -', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'צ''ורני יורי - מרגריטה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'אונגר- גורלובסקי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'קונדרטייב - איוונוב', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'רוגל יורם', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'גולוב- רחלי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'וימר נורית- גירוושין', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'ויצמן - בוטורשוילי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'בלסון קלאודין - ליאורה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'נתנזון יובל- שקולניק ניקיטה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'בנקליפה - גמר אייה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'דהן אמנון ואח''', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'קרסנטי - אולג', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'גנס לב- בליומין', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'נאה יהודה ולירון- דיין', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'ביצ''קוב איגור - זנאתי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'גורן - כץ', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'שלו - צ''ורני יורי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'פישה - נסטרנקו זויה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'רוזנטל - ויסוצקי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'מרגריטה - קונדרטייב נינה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'מואיסיס - וטפא', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'לוטם וליחי שושן', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'גורלובסקי אירינה - צ''רנין ילנה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'לוסטיג - לוסטיג', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'רות פיילר - ניר דמרי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'קשפר ויקטור - שגב', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'בולוס - גרזוזי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'קאי מיכאל ומרגלית - עמר חלחיל', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'אבישי ואורטל עטיה  -', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'פרנקל - מזרחי ניקול', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'דותן פדידה - מקסים שבץ', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'לוי - גנס', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'רפאלי - סגל צבי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'סגל - בורקוב', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'ניר מירקין -אמאל', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'גיא - חרסונסקי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'שחר דינה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'היטנר - פסח', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'עבדה - אריאלי נריה', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'לילך דהן - יוסיפוב', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'אופטובסקי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'קרן, כרמלה, ניר- עוז אלדד וירדן', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'מויסה  - בן טוב איתי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'ברזון - דהן עדי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'גנס לב -יוחימנקו', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'אוחנה רותם ויפית - בובליל', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'אביטל ניסים - נעמה איברהים', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'קרני - דרנג אסא ואיריס', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'סער- סופר ממי ואלי חיים', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'חנינה ברמי ואח'' - שחר רונית וליאור', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'גאורי יוסף אדם', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'הררי -קופפרמן', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'רייף - אודי אוהד קליפי', 'excel_import' FROM organizations LIMIT 1;
INSERT INTO clients (organization_id, name, source) SELECT id, 'חזן - ספרינקלים', 'excel_import' FROM organizations LIMIT 1;

-- חלק ג: תיקים
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אשכר טליה' LIMIT 1), 'אשכר טליה', 'sale', 'pending', NULL, 'יש טיוטה, ממתינה לעדכון של משה לגבי לוח תשלומים | מתווך: משה קבסה ', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='סלק העברה ללא תמורה' LIMIT 1), 'סלק העברה ללא תמורה - נהרייה', 'sale', 'pending', 9440.0, 'גוש/חלקה: 45/5 18168 | מוכן לחתימה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='סלומני העברה ללא תמורה' LIMIT 1), 'סלומני העברה ללא תמורה - עבדון', 'sale', 'pending', 8500.0, '', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='בירס -סולימני' LIMIT 1), 'בירס -סולימני - שאול המלך 20 מעלות', 'sale', 'pending', NULL, 'גוש/חלקה: 8  19445 | טיוטה ', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='סולימני - אחות בירס' LIMIT 1), 'סולימני - אחות בירס - הסיגליות 14 מעלות', 'sale', 'pending', NULL, 'גוש/חלקה: 18489,21/12 | יש להשלים טופס ארנונה, יתרת משכנתא ופרטי קונים', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='רונן מני' LIMIT 1), 'רונן מני - בן שלום עובדיה 34 נתניה', 'sale', 'pending', NULL, 'שכ"ט מקורי: 0.75 % + מע"מ | ', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='משה זגזג' LIMIT 1), 'משה זגזג - מגרש אבן מנחם', 'sale', 'pending', 10000.0, 'טיוטה הסכם מותנה בקבלה והארכת פיתוח | מתווך: ניר דמרי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='שחר סוזי וריקרדו-' LIMIT 1), 'שחר סוזי וריקרדו- - כרכום 5 כפר ורדים', 'sale', 'pending', NULL, 'שכ"ט מקורי: 0.4 כולל | טיוטה | מתווך: קילה ומעין', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אדלר דבורה' LIMIT 1), 'אדלר דבורה - מירון', 'sale', 'pending', NULL, 'שכ"ט מקורי: 0.5+מעמ | ', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='עופר' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='חזן - אינגה' LIMIT 1), 'חזן - אינגה', 'sale', 'pending', NULL, 'לעשות הערות לטיוטה | עו"ד צד שני: הודיה דיאמנט', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='ארבל אורן' LIMIT 1), 'ארבל אורן - בית העמק', 'sale', 'pending', NULL, 'מייצגים קונה | עו"ד צד שני: ארז בר', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='עופר' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='הירש גבריאל וקטיה -' LIMIT 1), 'הירש גבריאל וקטיה - - עין יעקב', 'sale', 'pending', NULL, 'גוש/חלקה: 19899/87 | שכ"ט מקורי: 0.75+מע"מ | טיוטה + שומה עצמית', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='רונית שחר -' LIMIT 1), 'רונית שחר - - קיבוץ אילון', 'sale', 'pending', 10000.0, 'גוש/חלקה: 18523/263', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='סגלי אמי אליזבטה - קורן' LIMIT 1), 'סגלי אמי אליזבטה - קורן - מצובה', 'sale', 'pending', 8000.0, 'עסקה עם האמא', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='בן אברהם אליה' LIMIT 1), 'בן אברהם אליה - מירון 5/15 מעלות', 'sale', 'pending', NULL, 'גוש/חלקה: 21166/166/15 | העברה ללא תמורה בין האישה לבעלה - מכירה לפי דירה יחידה 49ב(2), ורכישה לפי דירה יחידה - רוצים אחרי זה למכור לצד ג'' (לדבר איתו לאחר בדיקה של המיסים שאפשרי )', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='איתן שוחט' LIMIT 1), 'איתן שוחט - מצדה 16', 'sale', 'pending', NULL, 'גוש/חלקה: 21166/81/4 | לא מעונין בהסכם מותנה, ממתינים לרישום על שמו,קבע עם לילך ב1.12 | מתווך: יניב בוזגלו', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='קונובלנקו פבל- פארס סימון' LIMIT 1), 'קונובלנקו פבל- פארס סימון - מירון 16/4 מעלות', 'sale', 'active', NULL, 'שלחתי מסמכים לרישום הע"א לחברה משכנת  | משכנתא: יש | מתווך: אנגליקה ', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='נורדמן - יוסי אלפסי' LIMIT 1), 'נורדמן - יוסי אלפסי - מושב לימן', 'sale', 'active', NULL, 'גוש/חלקה: 18210  162 | שכ"ט מקורי: 0.5+מעמ | לעשות הערות לטיוטה. מותנה בקבלת למושב | עו"ד צד שני: מירי דרכי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='זר אביעד ונורית -' LIMIT 1), 'זר אביעד ונורית - - מצדה 22 מעלות', 'sale', 'active', 7000.0, 'שכ"ט מקורי: 0.5 + מע"מ | טיוטה+ שומה עצמית | מתווך: משה קבסה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אלפסי יוסף -' LIMIT 1), 'אלפסי יוסף - - חוסן', 'sale', 'active', NULL, 'שכ"ט מקורי: 0.5+מעמ | נרשנה הע"א ', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='צ''ורני יורי - מרגריטה' LIMIT 1), 'צ''ורני יורי - מרגריטה - עלית הנוער 1/7, מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 19435  11/7 | מסירה עד 15.8.2026 , תשלום שני עד 16.6 | משכנתא: יש | עו"ד צד שני: תאמר אבו יונס', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אונגר- גורלובסקי' LIMIT 1), 'אונגר- גורלובסקי - החשמונאים 6/3 מעלות', 'sale', 'active', 5250.0, 'גוש/חלקה: 19440  4/15 | מסירה עד 1.8 תשלום שני עד 25.6 שכ"ט תשלם ביוני | עו"ד צד שני: דקלה דויטש | מתווך: משה קבסה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='קונדרטייב - איוונוב' LIMIT 1), 'קונדרטייב - איוונוב - הרצל 155/10 מעלות', 'sale', 'active', 3800.0, 'גוש/חלקה: 18779  5/10 | מסירה עד 31/08/2026 מעקב קבלת ביטחונות | משכנתא: יש | מתווך: גרישה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='רוגל יורם' LIMIT 1), 'רוגל יורם - בן עמי', 'sale', 'active', NULL, 'העברה ללא תמורה מיסוי +רמי, ממתינים לשמאות ', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='גולוב- רחלי' LIMIT 1), 'גולוב- רחלי - כרם 4/5 כפר ורדים', 'sale', 'active', NULL, 'גוש/חלקה: 18410   64 |  מסירה 31/05/26 חברה משכנת צ.פ. יש כסף בנאמנות, חוסר אישור מועצה וועדה  | עו"ד צד שני: אבנר גולוב | מתווך: מעיין', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='וימר נורית- גירוושין' LIMIT 1), 'וימר נורית- גירוושין - אבירים', 'sale', 'active', NULL, 'גוש/חלקה: 19688   29 | הוגש להעברת זכויות מס'' פנייה 21759089, ב7.5 שלחנו פסן מקור', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='ויצמן - בוטורשוילי' LIMIT 1), 'ויצמן - בוטורשוילי - אומן', 'sale', 'active', NULL, 'גוש/חלקה: 20990   121 | מסירה 26.09.26 שלחתי לעו"ד כל האישורי מיסים  | עו"ד צד שני: טל משה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='בלסון קלאודין - ליאורה' LIMIT 1), 'בלסון קלאודין - ליאורה', 'sale', 'active', 15000.0, ' הוגש תיקון החלטה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='נתנזון יובל- שקולניק ניקיטה' LIMIT 1), 'נתנזון יובל- שקולניק ניקיטה - אבירים', 'sale', 'active', 19617.5, 'גוש/חלקה: 19688   64 | שכ"ט מקורי: 0.75+מעמ | מותנה בקבלה למושב אין פטור ממס שבח, יש לטפל בסילוק משכנתא | משכנתא: יש | עו"ד צד שני: שלומי קסלסי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='בנקליפה - גמר אייה' LIMIT 1), 'בנקליפה - גמר אייה - אביר יעקב 18  נהריה', 'sale', 'active', NULL, 'גוש/חלקה: 18148/92/4 | מסירה - 30/04/26 שלחתי מכתב הכוונות בערך העו"ד עדכנה שיהיה כנראה עיכוב | משכנתא: נמסר מכתב כוונות ב15/3 | עו"ד צד שני: ליעד אטיאס', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='דהן אמנון ואח''' LIMIT 1), 'דהן אמנון ואח'' - הגליל 441/18 מעלות', 'sale', 'active', 6000.0, 'גוש/חלקה: 18737/7/19 | מסירה - 24/05/26 נשאר רק אישור עירייה  | עו"ד צד שני: קלאודיה מרקוב | מתווך: יש', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='קרסנטי - אולג' LIMIT 1), 'קרסנטי - אולג - צבעוני 7 ב מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21093/24/2 | שכ"ט מקורי: שולם | מסירה - 31/05/26 - ב11/3 הוגש העברת משלמים בארנונה פניה מס'' 5071 | עו"ד צד שני: זיאד סמעאן | מתווך: יניב בוזגלו', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='גנס לב- בליומין' LIMIT 1), 'גנס לב- בליומין - ההגנה 39/1 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 19436/2/7 | מסירה - 01/06/2026 תיק מוכן | עו"ד צד שני: וינוקורוב | מתווך: אנגליקה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='נאה יהודה ולירון- דיין' LIMIT 1), 'נאה יהודה ולירון- דיין - מצדה 8/22 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21166 | מסירה ב15/6/26 ב19/4 הוגש בקשה לנכס ריק פניה 5338, הוגש בקשה להעברת משלמים פניה 5347, אין עדיין מס שבח סגרו רק רכישה | משכנתא: יש | מתווך: קיילה ומעיין', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='ביצ''קוב איגור - זנאתי' LIMIT 1), 'ביצ''קוב איגור - זנאתי - זלמן שז"ר 452/14', 'sale', 'active', NULL, 'גוש/חלקה: 18778  6/14 | שכ"ט מקורי: שולם | מסירה -  07/06/26 מעקב קבלת צו קיום צוואה | עו"ד צד שני: שרה זנאתי | מתווך: יניב בוזגלו', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='גורן - כץ' LIMIT 1), 'גורן - כץ - מצדה 22/5 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21166  84/5 | שכ"ט מקורי: יחד עם תשלום השני | מסירה - 01/07/26 יש מס שבח מקדמה. תשלום השני ישלם יחד עם משכנתא | עו"ד צד שני: מירי דרכי | מתווך: אירה ואנה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='שלו - צ''ורני יורי' LIMIT 1), 'שלו - צ''ורני יורי - עין שדה 42 שלומי', 'sale', 'active', NULL, 'גוש/חלקה: 21171 126 |  מסירה - 15/07/26 נשאר משכנתא | משכנתא: יש | עו"ד צד שני: שילה שגל', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='פישה - נסטרנקו זויה' LIMIT 1), 'פישה - נסטרנקו זויה - ההגנה 32/3 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 19436  4/3 | מסירה - 26/07/26 יש מס שבח מקדמה, הקפאה דירה שניה | עו"ד צד שני: סבטה | מתווך: גריגורי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='רוזנטל - ויסוצקי' LIMIT 1), 'רוזנטל - ויסוצקי - בהברקן 11, מעלות', 'sale', 'active', 4250.0, 'גוש/חלקה: 18484/6 | מסירה - 10/08/26 | עו"ד צד שני: הודיה דיאמנט', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='מרגריטה - קונדרטייב נינה' LIMIT 1), 'מרגריטה - קונדרטייב נינה - אסתר המלכה 3 מעלות', 'sale', 'active', 5865.0, 'גוש/חלקה: 19443 | מסירה - 15/08/26 תשלום שלישי עד 15.6 נגד מכתב הכוונות | משכנתא: יש | עו"ד צד שני: תאמר אבו יונס', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='מואיסיס - וטפא' LIMIT 1), 'מואיסיס - וטפא - עפרוני 33 כפר ורדים', 'sale', 'active', NULL, 'גוש/חלקה: 21148/66 | מסירה - 15/08/26 נחתמו מסמכי משכנת לחתימה להדפיס מס שבח | משכנתא: ממתין | עו"ד צד שני: נדאל מילאוי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='לוטם וליחי שושן' LIMIT 1), 'לוטם וליחי שושן - מירון 4 דירה 5 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21166/165 | שכ"ט מקורי: שולם | מסירה - 30/08/26 מטפלים בגרירה של המשכנתא | משכנתא: יש | עו"ד צד שני: זיאד סמעאן | מתווך: אנה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='גורלובסקי אירינה - צ''רנין ילנה' LIMIT 1), 'גורלובסקי אירינה - צ''רנין ילנה - סיגליות 2/3מעלות', 'sale', 'active', 4000.0, 'גוש/חלקה: 18594  10/3 | מסירה עד 1/9 שלחתי נסח נקי תשלום שני עד 1.6 | משכנתא: יש | עו"ד צד שני: ואדים | מתווך: משה קבסה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='לוסטיג - לוסטיג' LIMIT 1), 'לוסטיג - לוסטיג - נהריה נחלה 105 תל חי 18', 'sale', 'active', NULL, 'גוש/חלקה: 19592/14 | שכ"ט מקורי: שולם | מעקב תשלום מס שבח ניר לקח בקשה להחתמת האגודה ב14/9 התקבלו לאגודה מותנה ברישום ע"ש הקונה  - מתנה אבא לבן ומכר מהדודה לבן | מתווך: ניר דמרי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='רות פיילר - ניר דמרי' LIMIT 1), 'רות פיילר - ניר דמרי - כפר שמאי', 'sale', 'active', NULL, 'גוש/חלקה: 14689   54 | ניר מטפל בנכות לצורך ביטול הקנס ברמי ובמיסוי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='קשפר ויקטור - שגב' LIMIT 1), 'קשפר ויקטור - שגב - משעול הערבה 10/36 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21090   33 | מסירה - 31/05/26 שלחנו מסמכי העברת זכויות | משכנתא: יש | מתווך: יניב בוזגלו', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='בולוס - גרזוזי' LIMIT 1), 'בולוס - גרזוזי - מירון 20 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21166  33 |  מסירה מתעכבת- ממתינים לאישור המשכנתא של הקונה, הנכס בהליך רישום בית משותף | עו"ד צד שני: ג''ריס ברהום', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='קאי מיכאל ומרגלית - עמר חלחיל' LIMIT 1), 'קאי מיכאל ומרגלית - עמר חלחיל - חבצלת 14 כפר ורדים', 'sale', 'active', NULL, 'גוש/חלקה: 21073/113 | מסירה בוצאה נשאר רק אישור ועדה (יש צ''ק בנאמנות) | עו"ד צד שני: גריס ברהום', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אבישי ואורטל עטיה  -' LIMIT 1), 'אבישי ואורטל עטיה  - - מצדה 10 דירה 19', 'sale', 'active', 6608.0, 'גוש/חלקה: 21166/164/19 | מסירה - 01/05/26 מוכן למסירה | עו"ד צד שני: אליאס מוסא | מתווך: אירה (אניה)', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='פרנקל - מזרחי ניקול' LIMIT 1), 'פרנקל - מזרחי ניקול - צאלים 21, כפר ורדים', 'sale', 'active', 12400.0, 'גוש/חלקה: 22149 17 | הוגש לרמי פניה 21765700 , הקפאה דירה שניה 23.6.26 , מס רכישה | עו"ד צד שני: הודיה דיאמנט', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='דותן פדידה - מקסים שבץ' LIMIT 1), 'דותן פדידה - מקסים שבץ - מירון 1/13 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21166/166/32 | ממתינים לעדכון ללאור לגבי אישור עירייה | מתווך: אנגליקה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='לוי - גנס' LIMIT 1), 'לוי - גנס - צנחנים 20 נהריה', 'sale', 'active', NULL, 'גוש/חלקה: 19593/116 |  מעקב קבלת אישור ועד הבית. מסמכי העברת זכויות נשלח ב3.5 | משכנתא: יש | עו"ד צד שני: דורין צחר', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='רפאלי - סגל צבי' LIMIT 1), 'רפאלי - סגל צבי - ק.ביאליק', 'sale', 'active', NULL, 'גוש/חלקה: 10236  107/33 |  מס רכישה בהקפאה | משכנתא: יש | עו"ד צד שני: רון זילברמן | מתווך: אור', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='סגל - בורקוב' LIMIT 1), 'סגל - בורקוב - ההגנה 33/1 מעלות', 'sale', 'active', 6372.0, 'גוש/חלקה: 19436.14285714286 | 30,000 בנאמנות של עופר מעקב קבלת אישור ועדה ועירייה  | עו"ד צד שני: ויקטוריה פישמן | מתווך: אלכס', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='ניר מירקין -אמאל' LIMIT 1), 'ניר מירקין -אמאל - חרמון 5, אורנים מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 21166/61/4 | שכ"ט מקורי: שולם | מסירה - 26/03/26 - ב11/3 הוגש העברת משלמים בארנונה פניה מס'' 5068 מירקין, להכין שטר מכר | עו"ד צד שני: מאלק מורקוס | מתווך: ורדית', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='גיא - חרסונסקי' LIMIT 1), 'גיא - חרסונסקי - גולדן וילג כפר ורדים', 'sale', 'active', NULL, 'גוש/חלקה: 18410/64 | שכ"ט מקורי: שולם | ב15/4 נשלח לעודה ממתינים לאישור סופי | מתווך: אנה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='שחר דינה' LIMIT 1), 'שחר דינה', 'sale', 'active', NULL, 'הונפק צו קיום צוואה, ב15/4 נשלח לעודה לקבלת אישור זכויות סופי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='היטנר - פסח' LIMIT 1), 'היטנר - פסח - כפר ורדים', 'sale', 'active', NULL, 'גוש/חלקה: 18710  57 | הוגש לרמ"י מס פנייה 21796145 | עו"ד צד שני: נטלי טמזין', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='עבדה - אריאלי נריה' LIMIT 1), 'עבדה - אריאלי נריה - שאול המלך 39', 'sale', 'active', 9000.0, 'גוש/חלקה: 18231.5 | העברה ברמי בוטלה - כי זה הופך להיות מכר בטאבו הכנתי שטר מכר ממתינים לרמי לסיום המכר | עו"ד צד שני: אופיר- חיים הררי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='לילך דהן - יוסיפוב' LIMIT 1), 'לילך דהן - יוסיפוב - ההגנה 2/9 נהרייה', 'sale', 'active', NULL, 'גוש/חלקה: 18166   161/23 | שכ"ט מקורי: שולם | בוצע מסירה מסמכים הועברו במייל לעו"ד, המוכרים שילמו ארנונה הקונים מטפלים באישור טאבו | עו"ד צד שני: קוטי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אופטובסקי' LIMIT 1), 'אופטובסקי - יחיעם', 'sale', 'active', NULL, 'שכ"ט מקורי: שולם | הוגש לרמי  פניה 21637843 הסכם חלוקת עיזבון פטור ממס , למקרה של מכירה 0.75% + מעמ שלחה מקור צו ירושה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='קרן, כרמלה, ניר- עוז אלדד וירדן' LIMIT 1), 'קרן, כרמלה, ניר- עוז אלדד וירדן - מגרש 116 רמות מנשה', 'sale', 'active', NULL, 'גוש/חלקה: 12381/4 | שכ"ט מקורי: שולם | הוגש לרמי פניה 21468602 | עו"ד צד שני: הדס ברקת', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='מויסה  - בן טוב איתי' LIMIT 1), 'מויסה  - בן טוב איתי - קריית ים', 'sale', 'active', NULL, 'גוש/חלקה: 10444/2458 | הוגש לרמי פניה 21456039 - יש להשלים הפניה - עמיגור רצו להשלמת מסמכים  | עו"ד צד שני: דינה גן עדן', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='ברזון - דהן עדי' LIMIT 1), 'ברזון - דהן עדי - זלמן שז"ר 452 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 18778/6/13 | הוגש לטאבו | עו"ד צד שני: ערן יתח | מתווך: משה קבסה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='גנס לב -יוחימנקו' LIMIT 1), 'גנס לב -יוחימנקו - ההגנה 14/5', 'sale', 'active', NULL, 'גוש/חלקה: 19434  20/14 | סך של 20,000 בנאמנות עד לאישור עירייה  | עו"ד צד שני: וינוקורוב | מתווך: אנג''ליקה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אוחנה רותם ויפית - בובליל' LIMIT 1), 'אוחנה רותם ויפית - בובליל - נהריה, הרצל 16', 'sale', 'active', NULL, 'גוש/חלקה: 18166/91/7 | שכ"ט מקורי: שולם | סך של 60,000 בנאמנות עד לתיקון החניה בטאבו ב19/4 הוגש לטאבו לתיקון | עו"ד צד שני: אירית בוקריס לוי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='לידור' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='אביטל ניסים - נעמה איברהים' LIMIT 1), 'אביטל ניסים - נעמה איברהים - יקינטון 22 כפר ורדים', 'sale', 'active', NULL, 'שכ"ט מקורי: שולם | סך של 50,000 בנאמנות הכללי עד לאישור וועדה מסמכים הועברו לעו"ד | עו"ד צד שני: גריס ברהום | מתווך: אנגלי''קה', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='קרני - דרנג אסא ואיריס' LIMIT 1), 'קרני - דרנג אסא ואיריס - קטיף 15 מעלות', 'sale', 'active', NULL, 'גוש/חלקה: 18407/15 | שכ"ט מקורי: שולם | הקפאה דירה שניה סך של 30,000 בנאמנות בחשבון הבנק עד לאישור ועדה +עירייה, ביום 16.2 הוגש לרמי פניה 21718888  יש מכתב חוסרים להשלמה | עו"ד צד שני: מירי דרכי | מתווך: מעין כהן', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='סער- סופר ממי ואלי חיים' LIMIT 1), 'סער- סופר ממי ואלי חיים - איילת השחר', 'sale', 'active', NULL, 'גוש/חלקה: 13784/427/21 | שכ"ט מקורי: שולם | הקפאה דירה שניה לא לשכוח שטרות משכנתא בסוף, מס רכישה,לעשות משכון | עו"ד צד שני: רותם ארביל', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='חנינה ברמי ואח'' - שחר רונית וליאור' LIMIT 1), 'חנינה ברמי ואח'' - שחר רונית וליאור - דולב 11 כפר ורדים', 'sale', 'active', NULL, 'גוש/חלקה: 18709/71 | שכ"ט מקורי: שולם | הקפאה דירה שנייה  באילון - הוגש לרמי לרישום ב7/9 פניה 21569917 בוצעה העברה 50,000 בנאמנות חסר עירייה  להזמין שטרות משכנתא | עו"ד צד שני: אורי בן שושן', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='גאורי יוסף אדם' LIMIT 1), 'גאורי יוסף אדם - גרנות הגליל', 'sale', 'pending', NULL, 'שכ"ט מקורי: 0.75+מעמ | עסקה בוטלה לגבות שכ"ט כלשהו?', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='הררי -קופפרמן' LIMIT 1), 'הררי -קופפרמן - מגרש 289 קיבוץ יחיעם', 'sale', 'pending', NULL, 'גוש/חלקה: 18958   14 | הסכם מותנה בקבלת לקיבוץ. | עו"ד צד שני: עדי טל', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='פולינה' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='רייף - אודי אוהד קליפי' LIMIT 1), 'רייף - אודי אוהד קליפי - רסקו, נהריה נחלה', 'sale', 'pending', NULL, 'גוש/חלקה: 19591/34 | שכ"ט מקורי: שולם | תנאי מתלה | עו"ד צד שני: יער בר | מתווך: ניר דמרי', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;
INSERT INTO matters (organization_id, client_id, title, type, status, agreed_fee, notes, responsible_lawyer_id)
  SELECT o.id, (SELECT id FROM clients WHERE organization_id=o.id AND name='חזן - ספרינקלים' LIMIT 1), 'חזן - ספרינקלים', 'sale', 'pending', NULL, 'פניה 21217952 רמי מבקשים המלצה ממשרד הכלכלה לכך', (SELECT id FROM profiles WHERE organization_id=o.id AND full_name='צופית' LIMIT 1)
  FROM organizations o LIMIT 1;