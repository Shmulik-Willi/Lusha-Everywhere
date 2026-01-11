// company-extractor.js - Smart company name extraction from page context

/**
 * Extract company name from the page based on context around the selected name
 * @param {string} selectedName - The name that was selected
 * @param {HTMLElement} selectionElement - The element containing the selection
 * @returns {string|null} The company name if found, or null
 */
function extractCompanyFromPage(selectedName, selectionElement) {
  console.log('[Company Extractor] Starting extraction for:', selectedName);

  // Try strategies from most reliable to least reliable
  // Context-based extraction is most reliable as it looks at text around the name
  // Page-level methods (meta tags, title, domain) are fallbacks for when context fails
  const strategies = [
    extractFromContext,          // Highest priority: text near the name
    extractFromLinkedIn,         // LinkedIn-specific selectors
    extractFromStructuredData,   // JSON-LD structured data
    extractFromMetaTags,         // Page meta tags (may be too generic)
    extractFromPageTitle,        // Page title
    extractFromDomain            // Last resort: domain name
  ];

  for (const strategy of strategies) {
    try {
      const company = strategy(selectedName, selectionElement);
      if (company) {
        const cleaned = cleanCompanyName(company);
        if (cleaned && cleaned.length >= 2) {
          console.log(`[Company Extractor] Found via ${strategy.name}:`, cleaned);
          return cleaned;
        }
      }
    } catch (error) {
      console.warn(`[Company Extractor] ${strategy.name} failed:`, error.message);
    }
  }

  console.log('[Company Extractor] No company found');
  return null;
}

/**
 * Extract from LinkedIn pages
 */
function extractFromLinkedIn(selectedName, element) {
  const hostname = window.location.hostname;
  if (!hostname.includes('linkedin.com')) {
    return null;
  }

  // LinkedIn profile - current company
  const selectors = [
    '.pv-text-details__right-panel-item-text',
    '.pv-entity__secondary-title',
    '.experience-group-header__company',
    '[data-field="experience_company_logo"] a',
    '.org-top-card-summary__title',
    'h1.org-top-card-summary__info-item'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }

  return null;
}

/**
 * Extract from JSON-LD structured data
 */
function extractFromStructuredData() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);

      // Organization
      if (data['@type'] === 'Organization' && data.name) {
        return data.name;
      }

      // Person with employer
      if (data['@type'] === 'Person' && data.worksFor) {
        if (typeof data.worksFor === 'string') {
          return data.worksFor;
        }
        if (data.worksFor.name) {
          return data.worksFor.name;
        }
      }

      // Corporation
      if ((data['@type'] === 'Corporation' || data['@type'] === 'LocalBusiness') && data.name) {
        return data.name;
      }
    } catch (e) {
      // Invalid JSON, continue
    }
  }

  return null;
}

/**
 * Extract from meta tags
 */
function extractFromMetaTags() {
  // Open Graph site name
  const ogSiteName = document.querySelector('meta[property="og:site_name"]');
  if (ogSiteName?.content) {
    return ogSiteName.content;
  }

  // Application name
  const appName = document.querySelector('meta[name="application-name"]');
  if (appName?.content) {
    return appName.content;
  }

  // Twitter site (without @)
  const twitterSite = document.querySelector('meta[name="twitter:site"]');
  if (twitterSite?.content) {
    return twitterSite.content.replace('@', '');
  }

  return null;
}

/**
 * Extract from context around the selected text
 */
function extractFromContext(selectedName, element) {
  if (!element) return null;

  // Walk up to find a meaningful container
  let container = element;
  for (let i = 0; i < 5 && container && container !== document.body; i++) {
    if (container.matches('tr, li, article, section, div[class*="card"], div[class*="profile"], div[class*="person"], div[class*="member"]')) {
      break;
    }
    container = container.parentElement;
  }

  if (!container || container === document.body) {
    container = element;
  }

  const text = container.textContent || '';
  console.log('[Company Extractor] Context text (first 500 chars):', text.substring(0, 500));

  // Escape the name for regex
  const escapedName = selectedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern 1: "Name, Title at/with/- Company" or "Name, Title, Company"
  // Handles: "Hodaya Hanya, R&D Director, eToro"
  const titleCompanyPattern = new RegExp(
    `${escapedName}[,\\s\\n]+(?:[\\p{L}\\s-]+)?(?:CEO|CTO|CFO|COO|CDO|CMO|CRO|EVP|SVP|VP|Vice President|President|Director|Manager|Engineer|Head|Chief|Lead|Architect|Specialist|Analyst|Coordinator|Field|Senior|Principal|Staff|Consultant|Founder|Co-Founder)[^\\n]*?[,\\s-]+(?:at|with|of|for|@)?[\\s|•-]*([A-Za-z\\p{L}][\\p{L}0-9&.,'\\s()-]{1,60})`,
    'iu'
  );
  let match = text.match(titleCompanyPattern);
  if (match && match[1]) {
    const company = match[1].trim();
    if (!selectedName.toLowerCase().includes(company.toLowerCase())) {
      let cleaned = cleanCompanyName(company);
      if (cleaned && cleaned.length > 1) {
        return cleaned;
      }
    }
  }

  // Pattern 2: "Name at/from/with Company"
  const atPattern = new RegExp(`${escapedName}[,\\s\\n]+(?:at|from|with|@)[\\s]+([A-Za-z][A-Za-z0-9&.,'\\s-]{2,50})`, 'i');
  match = text.match(atPattern);
  if (match && match[1]) {
    const company = match[1].trim().split(/\n/)[0];
    if (!selectedName.toLowerCase().includes(company.toLowerCase())) {
      return company;
    }
  }

  // Pattern 3: "Name - Company" or "Name | Company"
  const separatorPattern = new RegExp(`${escapedName}[\\s]*[-|•][\\s]*([A-Za-z][A-Za-z0-9&.,'\\s-]{2,50})`, 'i');
  match = text.match(separatorPattern);
  if (match && match[1]) {
    const company = match[1].trim().split(/\n/)[0];
    if (!selectedName.toLowerCase().includes(company.toLowerCase())) {
      return company;
    }
  }

  // Pattern 4: Look after a job title without "at"
  const jobTitlePattern = new RegExp(
    `${escapedName}[,\\s\\n]+(?:CEO|CTO|CFO|COO|CDO|CMO|CRO|EVP|SVP|VP|Vice President|President|Director|Manager|Head|Chief|Lead|Co-Founder|Founder)[\\s\\w]*[,\\s-]+([A-Za-z][A-Za-z0-9&.,'\\s-]{2,50})`,
    'i'
  );
  match = text.match(jobTitlePattern);
  if (match && match[1]) {
    const company = match[1].trim().split(/\n/)[0];
    if (!selectedName.toLowerCase().includes(company.toLowerCase())) {
      const cleaned = cleanCompanyName(company);
      if (cleaned) return cleaned;
    }
  }

  // Pattern 5: Look for company info after the name on same line (generic)
  const sameLine = new RegExp(
    `${escapedName}[,\\s|•-]+[^\\n]+?(?:at|with|@)[\\s]+([A-Z][A-Za-z0-9&.,'\\s-]{2,50})`,
    'i'
  );
  match = text.match(sameLine);
  if (match && match[1]) {
    const company = match[1].trim().split(/\n/)[0];
    if (!selectedName.toLowerCase().includes(company.toLowerCase())) {
      return company;
    }
  }

  // Pattern 6: Look for company links nearby
  const companyLinks = container.querySelectorAll('a[href*="company"], a[href*="linkedin.com/company"]');
  for (const link of companyLinks) {
    const linkText = link.textContent.trim();
    if (linkText.length > 1 && linkText.length < 50 && !selectedName.toLowerCase().includes(linkText.toLowerCase())) {
      return linkText;
    }
  }

  return null;
}

/**
 * Extract from page title
 */
function extractFromPageTitle() {
  const title = document.title;
  if (!title) return null;

  // Common patterns: "Company - Page" or "Page | Company"
  const patterns = [
    /^([A-Z][A-Za-z0-9&.\s]{2,30})\s*[-|]/,
    /[-|]\s*([A-Z][A-Za-z0-9&.\s]{2,30})$/,
    /^About\s+([A-Z][A-Za-z0-9&.\s]{2,30})/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const company = match[1].trim();
      // Reject generic words
      if (!isGenericWord(company)) {
        return company;
      }
    }
  }

  return null;
}

/**
 * Extract from domain name (last resort)
 */
function extractFromDomain() {
  const hostname = window.location.hostname;

  // Skip common domains
  const skipDomains = ['google', 'linkedin', 'facebook', 'twitter', 'github', 'stackoverflow', 'wikipedia', 'youtube'];

  // Remove www and get first part
  let domain = hostname.replace(/^www\./, '').replace(/^blog\./, '').replace(/^about\./, '');
  const parts = domain.split('.');

  if (parts.length >= 2) {
    const company = parts[0];
    if (!skipDomains.includes(company.toLowerCase())) {
      // Capitalize first letter
      return company.charAt(0).toUpperCase() + company.slice(1);
    }
  }

  return null;
}

/**
 * Clean and validate company name
 */
function cleanCompanyName(name) {
  if (!name || typeof name !== 'string') return null;

  // Remove HTML and normalize whitespace
  let cleaned = name.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  // Remove content in parentheses (e.g. "(Denmark)", "(USA)")
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');

  // Remove potential academic/other noise at the end (e.g. "M.Sc.", "University", " - ")
  // This helps when the extractor grabs adjacent text
  // Enhanced to catch patterns like "M.A. in Chemistry", "Ph.D. in Physics", etc.
  cleaned = cleaned.replace(/\s*(M\.A\.|M\.Sc\.|M\.S\.|B\.A\.|B\.Sc\.|B\.S\.|Ph\.D\.|PhD|MBA|BSc|MSc|MA|MS|BA|BS)[\s]+(in|of|from)[\s]+[A-Za-z\s]+$/i, '');
  cleaned = cleaned.replace(/\s*(M\.A\.|M\.Sc\.|M\.S\.|B\.A\.|B\.Sc\.|B\.S\.|Ph\.D\.|PhD|MBA|BSc|MSc|MA|MS|BA|BS|Bachelor|Master|University|College|Degree|Diploma|School).*$/i, '');

  // Remove " - " or " | " if they appear after the name (separator to next field)
  cleaned = cleaned.split(/[\s]+[-|•][\s]+/)[0];

  // Remove common suffixes and region indicators
  cleaned = cleaned
    .replace(/[,\s]+(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Co\.?|PLC|L\.P\.)$/i, '')
    .replace(/[,\s]+(EMEA|APAC|Americas|North America|Global|International|Region)$/i, '')
    .trim();

  // Remove quotes and special chars from edges only
  cleaned = cleaned.replace(/^["'\[\]()]+|["'\[\]()]+$/g, '').trim();

  // Remove trailing punctuation but preserve mid-word punctuation (like "Amazon Web Services")
  cleaned = cleaned.replace(/[,;:.!?]+$/, '').trim();

  // Validate length
  if (cleaned.length < 2 || cleaned.length > 60) return null;

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(cleaned)) return null;

  // Check for generic words
  if (isGenericWord(cleaned)) return null;

  return cleaned;
}

/**
 * Check if a word is generic and shouldn't be used as company name
 */
function isGenericWord(word) {
  const generic = [
    'home', 'about', 'contact', 'team', 'careers', 'jobs', 'blog', 'news',
    'login', 'signup', 'search', 'menu', 'navigation', 'footer', 'header',
    'accessibility', 'skip', 'main', 'content', 'page', 'site', 'website',
    'profile', 'settings', 'help', 'support', 'faq', 'privacy', 'terms',
    'cookie', 'copyright', 'all rights reserved', 'powered by',
    'follow us', 'subscribe', 'sign up', 'log in', 'learn more'
  ];

  const wordLower = word.toLowerCase().trim();
  return generic.some(g => wordLower === g || wordLower.endsWith(' ' + g));
}

// Export for content script
if (typeof window !== 'undefined') {
  window.extractCompanyFromPage = extractCompanyFromPage;
}

console.log('[Company Extractor] Module loaded');
