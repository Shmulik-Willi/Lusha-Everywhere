# 🔍 Lusha Contact Enrichment - Chrome Extension

A Chrome Extension that allows you to select names of people on any website and enrich them with data from Lusha API - email, phone, company, and position.

## ✨ Features

- ✅ **Smart Company Name Extraction from Page** 🤖 (New!)
  - Automatic agent that extracts company name from 8 sources: Meta tags, titles, context, LinkedIn, and more
  - No need to manually select the company name anymore!
  - Works on LinkedIn, company websites, blogs, and more
- ✅ Text selection on any website
- ✅ User-friendly floating button
- ✅ Data enrichment from Lusha API
- ✅ Display of: email, phone, company, and position
- ✅ Full English interface
- ✅ Modern and elegant design
- ✅ Dark mode support

## 📦 Installation

### Step 1: Download the Files
1. Save all files in the `chrome-extension` folder
2. Make sure you have all the following files:
   ```
   chrome-extension/
   ├── manifest.json
   ├── popup.html
   ├── popup.js
   ├── content.js
   ├── content.css
   ├── background.js
   ├── company-extractor.js  ← New! 🤖
   ├── icons/
   │   ├── icon16.png
   │   ├── icon48.png
   │   └── icon128.png
   └── README.md
   ```

### Step 2: Create Icons
1. Open the file `icons/create-icons.html` in browser
2. Click the "Download all icons" button
3. Copy the 3 downloaded files (icon16.png, icon48.png, icon128.png) to the `icons/` folder

### Step 3: Load the Extension to Chrome
1. Open Chrome and go to: `chrome://extensions`
2. Enable **"Developer mode"** in the top right corner
3. Click on **"Load unpacked"**
4. Select the `chrome-extension` folder
5. The extension will appear in your extensions list!

### Step 4: Set Up API Key
1. Click on the extension icon in Chrome's toolbar
2. Enter your API Key from Lusha's website
3. Click "Save API Key"

## 🚀 How to Use?

### 🤖 Smart Mode (Recommended!) - with Smart Extraction

1. **Go to any website** that has names of people (LinkedIn, company website, blog, etc.)
2. **Select only the name** of the person:
   - ✅ "Yoni Tserruya" → The extension will find "Lusha" automatically!
   - ✅ "Satya Nadella" → The extension will find "Microsoft" from the page!
   - ✅ "Tim Cook" → The extension will find "Apple" from the meta tags!
3. **Lusha button will appear** next to the selected text
4. **Click the button** - The extension will automatically extract the company name and enrich!
5. **You'll get the complete information:**
   - 📧 Email address
   - 📞 Phone number
   - 🏢 Company name
   - 💼 Position

### 📝 Manual Mode (if Smart Extraction didn't find a company)

If the extension couldn't find a company, you can select manually:
- ✅ "Yoni Tserruya Lusha"
- ✅ "John Doe Google"
- ✅ "Jane Smith example.com"

### 💡 How Does Smart Extraction Work?

The smart agent searches for company name in 8 sources:
1. **Meta Tags** (og:site_name, application-name)
2. **Page Title**
3. **Headings** (H1, H2)
4. **Context** around the name ("John Doe at Google", "works at Microsoft")
5. **LinkedIn** (company pages, profiles, posts)
6. **Structured Data** (JSON-LD)
7. **Domain** (lusha.com → "Lusha")
8. **Common Patterns** ("CEO at...", "Director at...")

📖 **For detailed guide:** See [SMART-EXTRACTION-GUIDE.md](SMART-EXTRACTION-GUIDE.md)

## 🎨 Screenshots

### API Key Settings Window
![Popup](screenshots/popup.png)

### Button in Action
![Selection Button](screenshots/selection.png)

### Enrichment Results
![Results](screenshots/results.png)

## ⚙️ Custom Lusha API Configuration

The default is to use the Lusha Person API. If you're using a different version of Lusha API, edit the file [background.js](background.js) at lines 15-30.

### Examples of Different API Versions:

#### Version 1: Person API (Default)
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

#### Version 2: Prospect API
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

#### Version 3: Enrich API
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

## 🔧 Troubleshooting

### The Extension Doesn't Work
- Make sure the API Key is valid and saved
- Check the Console on the page (F12) to find errors
- Make sure you have an internet connection

### Can't Find Information
- Make sure the name consists of at least 2 words (first name + last name)
- Try adding additional details like company name if known
- Check that you haven't exceeded your API quota

### The Button Doesn't Appear
- Make sure you selected text that contains letters (not just numbers)
- Try refreshing the page (F5)
- Check that the extension is enabled at chrome://extensions

## 📝 Response Format from Lusha API

The extension expects the following JSON format from Lusha:

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

Or:

```json
{
  "email": "john.doe@company.com",
  "phone": "+1-555-0123",
  "companyName": "Acme Corp",
  "title": "Senior Developer"
}
```

If your API returns a different format, edit [background.js:50-56](background.js#L50-L56).

## 🛡️ Security and Privacy

- The API Key is saved **locally in the browser** and is not sent to any external server
- Only you can see your API Key
- All calls are directly to the Lusha API
- The extension does not collect any personal information

## 🤝 Support

If you have questions or issues:
1. Check the **Troubleshooting** section above
2. Create an Issue on GitHub
3. Contact Lusha support for API-related questions

## 📄 License

MIT License - Free to use and modify

## 🎉 Acknowledgments

Built with ❤️ for Lusha users
