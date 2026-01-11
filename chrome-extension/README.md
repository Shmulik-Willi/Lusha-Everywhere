# 🔍 Lusha Contact Enrichment - Chrome Extension

Chrome Extension שמאפשר לסמן שמות של אנשים בכל אתר ולהעשיר אותם עם נתונים מ-Lusha API - מייל, טלפון, חברה ותפקיד.

## ✨ תכונות

- ✅ **חילוץ חכם של שם החברה מהדף** 🤖 (חדש!)
  - Agent אוטומטי שמחלץ שם חברה מ-8 מקורות: Meta tags, כותרות, הקשר, LinkedIn ועוד
  - לא צריך לסמן את שם החברה ידנית יותר!
  - עובד על LinkedIn, אתרי חברות, בלוגים ועוד
- ✅ סימון טקסט בכל אתר
- ✅ כפתור צף ידידותי למשתמש
- ✅ העשרת נתונים מ-Lusha API
- ✅ הצגת: מייל, טלפון, חברה ותפקיד
- ✅ ממשק עברי מלא
- ✅ עיצוב מודרני ואלגנטי
- ✅ תמיכה במצב כהה

## 📦 התקנה

### שלב 1: הורדת הקבצים
1. שמור את כל הקבצים בתיקייה `chrome-extension`
2. ודא שיש לך את כל הקבצים הבאים:
   ```
   chrome-extension/
   ├── manifest.json
   ├── popup.html
   ├── popup.js
   ├── content.js
   ├── content.css
   ├── background.js
   ├── company-extractor.js  ← חדש! 🤖
   ├── icons/
   │   ├── icon16.png
   │   ├── icon48.png
   │   └── icon128.png
   └── README.md
   ```

### שלב 2: יצירת אייקונים
1. פתח את הקובץ `icons/create-icons.html` בדפדפן
2. לחץ על הכפתור "הורד את כל האייקונים"
3. העתק את 3 הקבצים שירדו (icon16.png, icon48.png, icon128.png) לתיקייה `icons/`

### שלב 3: טעינת ההרחבה ל-Chrome
1. פתח את Chrome וגש ל: `chrome://extensions`
2. הפעל את **"Developer mode"** (מצב מפתח) בפינה הימנית העליונה
3. לחץ על **"Load unpacked"** (טען ארוז)
4. בחר את התיקייה `chrome-extension`
5. ההרחבה תופיע ברשימת ההרחבות שלך!

### שלב 4: הגדרת API Key
1. לחץ על אייקון ההרחבה בסרגל הכלים של Chrome
2. הזן את ה-API Key שלך מהאתר של Lusha
3. לחץ על "שמור API Key"

## 🚀 איך משתמשים?

### 🤖 מצב חכם (מומלץ!) - עם Smart Extraction

1. **גש לאתר כלשהו** שיש בו שמות של אנשים (LinkedIn, אתר חברה, בלוג וכו')
2. **סמן רק את השם** של האדם:
   - ✅ "Yoni Tserruya" → ההרחבה תמצא "Lusha" אוטומטית!
   - ✅ "Satya Nadella" → ההרחבה תמצא "Microsoft" מהדף!
   - ✅ "Tim Cook" → ההרחבה תמצא "Apple" מה-meta tags!
3. **כפתור Lusha יופיע** ליד הטקסט המסומן
4. **לחץ על הכפתור** - ההרחבה תחלץ אוטומטית את שם החברה ותעשיר!
5. **תקבל את המידע המלא:**
   - 📧 כתובת מייל
   - 📞 מספר טלפון
   - 🏢 שם החברה
   - 💼 תפקיד

### 📝 מצב ידני (אם Smart Extraction לא מצא חברה)

אם ההרחבה לא הצליחה למצוא חברה, אפשר לסמן ידנית:
- ✅ "Yoni Tserruya Lusha"
- ✅ "John Doe Google"
- ✅ "Jane Smith example.com"

### 💡 איך Smart Extraction עובד?

ה-Agent החכם מחפש שם חברה ב-8 מקורות:
1. **Meta Tags** (og:site_name, application-name)
2. **כותרת הדף** (Page Title)
3. **כותרות** (H1, H2)
4. **הקשר** סביב השם ("John Doe at Google", "works at Microsoft")
5. **LinkedIn** (company pages, profiles, posts)
6. **Structured Data** (JSON-LD)
7. **Domain** (lusha.com → "Lusha")
8. **דפוסים נפוצים** ("CEO at...", "Director at...")

📖 **למדריך מפורט:** ראה [SMART-EXTRACTION-GUIDE.md](SMART-EXTRACTION-GUIDE.md)

## 🎨 צילומי מסך

### חלון הגדרות ה-API Key
![Popup](screenshots/popup.png)

### כפתור בפעולה
![Selection Button](screenshots/selection.png)

### תוצאות העשרה
![Results](screenshots/results.png)

## ⚙️ התאמה אישית של Lusha API

ברירת המחדל היא להשתמש ב-Lusha Person API. אם אתה משתמש בגרסת API אחרת של Lusha, ערוך את הקובץ [background.js](background.js) בשורות 15-30.

### דוגמאות לגרסאות API שונות:

#### גרסה 1: Person API (ברירת מחדל)
```javascript
const response = await fetch('https://api.lusha.com/person', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api_key': apiKey
  },
  body: JSON.stringify({
    firstName: firstName,
    lastName: lastName
  })
});
```

#### גרסה 2: Prospect API
```javascript
const response = await fetch('https://api.lusha.com/v2/prospect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey
  },
  body: JSON.stringify({
    name: name
  })
});
```

#### גרסה 3: Enrich API
```javascript
const response = await fetch('https://api.lusha.com/enrich', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-token': apiKey
  },
  body: JSON.stringify({
    data: {
      person: {
        firstName: firstName,
        lastName: lastName
      }
    }
  })
});
```

## 🔧 פתרון בעיות

### ההרחבה לא עובדת
- ודא ש-API Key תקין ושמור
- בדוק את ה-Console בדף (F12) לאיתור שגיאות
- ודא שיש לך חיבור לאינטרנט

### לא מוצא מידע
- ודא שהשם מורכב מלפחות 2 מילים (שם פרטי + משפחה)
- נסה להוסיף פרטים נוספים כמו שם חברה אם ידוע
- בדוק שלא חרגת ממכסת ה-API שלך

### הכפתור לא מופיע
- ודא שסימנת טקסט שמכיל אותיות (לא רק מספרים)
- נסה לרענן את הדף (F5)
- בדוק שההרחבה מופעלת ב-chrome://extensions

## 📝 פורמט התשובה מ-Lusha API

ההרחבה מצפה לפורמט JSON הבא מ-Lusha:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "emailAddresses": [
    { "email": "john.doe@company.com" }
  ],
  "phoneNumbers": [
    { "internationalPhoneNumber": "+1-555-0123" }
  ],
  "company": {
    "name": "Acme Corp"
  },
  "position": "Senior Developer"
}
```

או:

```json
{
  "email": "john.doe@company.com",
  "phone": "+1-555-0123",
  "companyName": "Acme Corp",
  "title": "Senior Developer"
}
```

אם ה-API שלך מחזיר פורמט שונה, ערוך את [background.js:50-56](background.js#L50-L56).

## 🛡️ אבטחה ופרטיות

- ה-API Key נשמר **מקומית בדפדפן** ולא נשלח לשום שרת חיצוני
- רק אתה רואה את ה-API Key שלך
- כל הקריאות הן ישירות ל-Lusha API
- ההרחבה לא אוספת שום מידע אישי

## 🤝 תמיכה

אם יש לך שאלות או בעיות:
1. בדוק את מדור **פתרון בעיות** למעלה
2. צור Issue ב-GitHub
3. פנה לתמיכה של Lusha לגבי שאלות על ה-API

## 📄 רישיון

MIT License - חופשי לשימוש ושינוי

## 🎉 תודות

נבנה עם ❤️ עבור משתמשי Lusha
