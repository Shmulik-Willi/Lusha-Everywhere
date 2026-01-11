// background.js - Service Worker that makes Lusha API calls
// This runs in the extension's background and handles all API requests

console.log('[Lusha Everywhere] Background service worker loaded');

// No default API key - user must configure their own

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Lusha Everywhere] Message received:', message.type);

  if (message.type === 'ENRICH_CONTACT') {
    handleEnrichContact(message, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'ENRICH_COMPANY') {
    handleEnrichCompany(message, sendResponse);
    return true;
  }

  if (message.type === 'TEST_API') {
    testApiConnection(sendResponse);
    return true;
  }

  return false;
});

async function handleEnrichContact(message, sendResponse) {
  try {
    // Get API key - prefer message.apiKey, then storage
    let apiKey = message.apiKey;

    if (!apiKey) {
      const storage = await chrome.storage.sync.get('lushaApiKey');
      apiKey = storage.lushaApiKey;
    }

    if (!apiKey) {
      sendResponse({
        success: false,
        error: '🔑 No API Key configured. Please click the extension icon and enter your Lusha API Key.'
      });
      return;
    }

    console.log('[Lusha Everywhere] Using API key:', apiKey.substring(0, 8) + '...');

    const result = await enrichContact(message.name, apiKey, message.extractedCompany);
    sendResponse(result);

  } catch (error) {
    // Only log as error if it's a real technical error, not a "no data found" case
    if (error.message && error.message.includes('No data found')) {
      console.log('[Lusha Everywhere] No data found for contact:', message.name);
    } else {
      console.error('[Lusha Everywhere] Error in handleEnrichContact:', error);
    }
    sendResponse({
      success: false,
      error: error.message || 'Unknown error occurred'
    });
  }
}

async function handleEnrichCompany(message, sendResponse) {
  try {
    // Get API key
    let apiKey = message.apiKey;

    if (!apiKey) {
      const storage = await chrome.storage.sync.get('lushaApiKey');
      apiKey = storage.lushaApiKey;
    }

    if (!apiKey) {
      sendResponse({
        success: false,
        error: '🔑 No API Key configured. Please click the extension icon and enter your Lusha API Key.'
      });
      return;
    }

    console.log('[Lusha Everywhere] Enriching company:', message.companyName);

    const result = await enrichCompany(message.companyName, apiKey);
    sendResponse(result);

  } catch (error) {
    // Only log as error if it's a real technical error, not a "no data found" case
    if (error.message && (error.message.includes('No company found') || error.message.includes('No data found'))) {
      console.log('[Lusha Everywhere] No data found for company:', message.companyName);
    } else {
      console.error('[Lusha Everywhere] Error in handleEnrichCompany:', error);
    }
    sendResponse({
      success: false,
      error: error.message || 'Unknown error occurred'
    });
  }
}

async function enrichCompany(companyName, apiKey) {
  console.log('[Lusha Everywhere] enrichCompany called:', { companyName });

  const params = new URLSearchParams();

  // Check if input looks like a domain (has a dot)
  if (companyName.includes('.') && !companyName.includes(' ')) {
    params.append('domain', companyName);
  } else {
    // Try 'company' instead of 'companyName' for V2 Company API
    params.append('company', companyName);
  }

  const apiUrl = `https://api.lusha.com/v2/company?${params.toString()}`;
  console.log('[Lusha Everywhere] Company API URL:', apiUrl);

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'api_key': apiKey
      }
    });
  } catch (fetchError) {
    console.error('[Lusha Everywhere] Fetch error:', fetchError);
    throw new Error('Network error - check your internet connection');
  }

  console.log('[Lusha Everywhere] Response status:', response.status);

  if (response.status === 400) {
    const errorData = await response.json().catch(() => ({}));
    console.log('[Lusha Everywhere] 400 Error:', errorData);

    // Check if error is related to API key
    const errorMessage = errorData.message || errorData.error || '';
    if (errorMessage.toLowerCase().includes('api') ||
        errorMessage.toLowerCase().includes('key') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('authentication')) {
      throw new Error('❌ Invalid API Key - Please check your Lusha API Key in extension settings');
    }

    throw new Error('Invalid company search - please try a different name or domain');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('❌ Invalid API Key - Please check your Lusha API Key in extension settings');
  }

  if (response.status === 404) {
    throw new Error('No company found with this name');
  }

  if (response.status === 429) {
    throw new Error('API rate limit exceeded - try again later');
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Lusha Everywhere] API Error:', errorText);
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Lusha Everywhere] Company API Response:', JSON.stringify(data, null, 2));

  // The API structure for company might differ slightly, usually wrapped in data object
  const companyData = data.data || data;

  const result = {
    success: true,
    data: {
      type: 'company',
      name: companyData.name || companyName,
      logo: companyData.logo || companyData.logo_url,
      website: companyData.website || companyData.domain,
      description: companyData.description,
      industry: extractIndustry(companyData),
      employees: extractEmployees(companyData),
      founded: companyData.founded,
      revenue: extractRevenue(companyData),
      headquarters: extractHeadquarters(companyData),
      social: extractCompanySocial(companyData)
    }
  };

  // Try to fetch signals if we have sufficient data
  const companyId = companyData.id || companyData.companyId;
  if (companyId) {
    try {
      // Prepare data for signals API
      const signalsData = {
        domain: companyData.domain || companyData.domains?.homepage || result.data.website,
        name: result.data.name
      };

      const signals = await fetchSignals(companyId, apiKey, 'company', signalsData);
      if (signals && signals.length > 0) {
        result.data.signals = signals;
      }
    } catch (signalsError) {
      console.log('[Lusha Everywhere] Signals fetch failed (non-critical):', signalsError.message);
      // Don't fail the whole request if signals fail
    }
  }

  return result;
}

function extractRevenue(data) {
  let revenue = null;

  console.log('[Lusha Everywhere] Extracting revenue from:', JSON.stringify(data.revenueRange || data.revenue));

  if (data.revenueRange) {
    revenue = data.revenueRange.string || data.revenueRange;
  } else {
    revenue = data.revenue || data.annualRevenue;
  }

  if (!revenue) return null;

  // If it's a string like "10000000,50000000" or object with min/max
  let min, max;

  if (Array.isArray(revenue) && revenue.length === 2) {
    min = Number(revenue[0]);
    max = Number(revenue[1]);
  } else if (typeof revenue === 'string' && revenue.includes(',')) {
    [min, max] = revenue.split(',').map(s => {
      // Remove everything except digits and dots
      const clean = s.replace(/[^0-9.]/g, '');
      return parseFloat(clean);
    });
  } else if (typeof revenue === 'object' && (revenue.min || revenue.max)) {
    min = Number(revenue.min);
    max = Number(revenue.max);
  } else {
    // Try to parse single number
    const val = parseFloat(String(revenue).replace(/[^0-9.]/g, ''));
    if (!isNaN(val)) return formatMoney(val);
    return revenue; // Return as is if not parseable
  }

  // Check if we got valid numbers
  if ((!isNaN(min) && min > 0) || (!isNaN(max) && max > 0)) {
    console.log('[Lusha Everywhere] Formatted values - Min:', min, 'Max:', max);
    if (min && max) {
      // Changed separator to 'to' to verify update
      return `${formatMoney(min)} to ${formatMoney(max)}`;
    } else if (min) {
      return `${formatMoney(min)}+`;
    } else if (max) {
      return `Up to ${formatMoney(max)}`;
    }
  }

  console.log('[Lusha Everywhere] Failed to format numbers, returning raw:', revenue);
  return revenue; // Fallback to original if parsing failed
}

function formatMoney(amount) {
  if (!amount || isNaN(amount)) return '';

  if (amount >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(0).replace(/\.0$/, '')}B`;
  }
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(0).replace(/\.0$/, '')}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0).replace(/\.0$/, '')}K`;
  }

  return `$${amount}`;
}

function extractIndustry(data) {
  if (data.industryTags && Array.isArray(data.industryTags) && data.industryTags.length > 0) {
    return data.industryTags[0].name || data.industryTags[0];
  }
  return data.industry || data.industryPrimaryGroup || null;
}

function extractEmployees(data) {
  if (data.companySize && data.companySize.employees) {
    return data.companySize.employees;
  }
  return data.numberOfEmployees || data.employees || null;
}

function extractHeadquarters(data) {
  if (data.location) {
    const parts = [];
    if (data.location.city) parts.push(data.location.city);
    if (data.location.country) parts.push(data.location.country);
    return parts.join(', ');
  }
  return null;
}

function extractCompanySocial(data) {
  const social = [];

  // Check for social object (new API format)
  if (data.social && typeof data.social === 'object') {
    if (data.social.linkedin && data.social.linkedin.url) {
      social.push({ type: 'linkedin', url: data.social.linkedin.url });
    }
    if (data.social.facebook && data.social.facebook.url) {
      social.push({ type: 'facebook', url: data.social.facebook.url });
    }
    if (data.social.twitter && data.social.twitter.url) {
      social.push({ type: 'twitter', url: data.social.twitter.url });
    }
    if (data.social.crunchbase && data.social.crunchbase.url) {
      social.push({ type: 'crunchbase', url: data.social.crunchbase.url });
    }
  }

  // Check for socialProfiles array (old API format)
  if (data.socialProfiles && Array.isArray(data.socialProfiles)) {
    data.socialProfiles.forEach(p => {
      social.push({
        type: p.type || 'unknown',
        url: p.url
      });
    });
  }

  // Try individual fields as fallback
  if (data.linkedin_url || data.linkedin) {
    social.push({ type: 'linkedin', url: data.linkedin_url || data.linkedin });
  }
  if (data.facebook_url || data.facebook) {
    social.push({ type: 'facebook', url: data.facebook_url || data.facebook });
  }
  if (data.twitter_url || data.twitter) {
    social.push({ type: 'twitter', url: data.twitter_url || data.twitter });
  }

  return social.length > 0 ? social : null;
}

async function testApiConnection(sendResponse) {
  try {
    const storage = await chrome.storage.sync.get('lushaApiKey');
    const apiKey = storage.lushaApiKey;

    // Simple test call
    const response = await fetch('https://api.lusha.com/v2/person?firstName=Test&lastName=User&companyName=TestCompany', {
      method: 'GET',
      headers: {
        'api_key': apiKey
      }
    });

    sendResponse({
      success: true,
      status: response.status,
      message: `API responded with status ${response.status}`
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function enrichContact(fullName, apiKey, extractedCompany) {
  console.log('[Lusha Everywhere] enrichContact called:', {
    fullName,
    extractedCompany: extractedCompany || 'none',
    apiKeyPresent: !!apiKey
  });

  // Parse the name
  const { firstName, lastName, company } = parseName(fullName, extractedCompany);

  console.log('[Lusha Everywhere] Parsed name:', { firstName, lastName, company });

  if (!firstName || !lastName) {
    throw new Error('Please select a full name (first and last name)');
  }

  // Build query parameters
  const params = new URLSearchParams();
  params.append('firstName', firstName);
  params.append('lastName', lastName);

  if (company) {
    // If it looks like a domain, use companyDomain, otherwise companyName
    if (company.includes('.')) {
      params.append('companyDomain', company);
    } else {
      params.append('companyName', company);
    }
  }

  const apiUrl = `https://api.lusha.com/v2/person?${params.toString()}`;
  console.log('[Lusha Everywhere] API URL:', apiUrl);

  // Make the API call
  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'api_key': apiKey
      }
    });
  } catch (fetchError) {
    console.error('[Lusha Everywhere] Fetch error:', fetchError);
    throw new Error('Network error - check your internet connection');
  }

  console.log('[Lusha Everywhere] Response status:', response.status);

  // Handle HTTP errors
  if (response.status === 400) {
    const errorData = await response.json().catch(() => ({}));
    console.log('[Lusha Everywhere] 400 Error:', errorData);

    // Check if error is related to API key
    const errorMessage = errorData.message || errorData.error || '';
    if (errorMessage.toLowerCase().includes('api') ||
        errorMessage.toLowerCase().includes('key') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('authentication')) {
      throw new Error('❌ Invalid API Key - Please check your Lusha API Key in extension settings');
    }

    throw new Error('Not enough information. Try selecting the name with the company (e.g., "John Doe Google")');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('❌ Invalid API Key - Please check your Lusha API Key in extension settings');
  }

  if (response.status === 404) {
    throw new Error('No contact found for this person');
  }

  if (response.status === 429) {
    throw new Error('API rate limit exceeded - try again later');
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Lusha Everywhere] API Error:', errorText);
    throw new Error(`API Error: ${response.status}`);
  }

  // Parse response
  const data = await response.json();
  console.log('[Lusha Everywhere] API Response:', JSON.stringify(data, null, 2));

  // Check for Lusha-specific errors in 200 response
  if (data.contact?.error) {
    const errorCode = data.contact.error.code;
    const errorName = data.contact.error.name;

    if (errorCode === 3 || errorName === 'EMPTY_DATA') {
      throw new Error('No data found for this contact in Lusha database');
    }
    if (errorCode === 5 || errorName === 'COMPLIANCE_CONTACT_ERROR') {
      throw new Error('Cannot display data for this contact (compliance restriction)');
    }
    throw new Error(`Lusha Error: ${errorName || 'Unknown'}`);
  }

  // Format the response
  const contactData = data.contact?.data || data;

  const result = {
    success: true,
    data: {
      name: contactData.fullName || `${contactData.firstName || firstName} ${contactData.lastName || lastName}`,
      emails: extractEmails(contactData),
      email: extractEmail(contactData), // Keep single email for backward compatibility
      phones: extractPhones(contactData),
      phone: extractPhone(contactData), // Keep single phone for backward compatibility
      company: extractCompany(contactData),
      position: extractPosition(contactData),
      linkedInUrl: extractLinkedInUrl(contactData),
      seniority: extractSeniority(contactData),
      department: extractDepartment(contactData),
      location: extractLocation(contactData)
    }
  };

  // Try to fetch signals if we have sufficient data
  const contactId = contactData.id || contactData.personId;
  if (contactId) {
    try {
      // Prepare data for signals API
      const signalsData = {
        linkedInUrl: result.data.linkedInUrl,
        fullName: result.data.name,
        companyName: result.data.company
      };

      const signals = await fetchSignals(contactId, apiKey, 'person', signalsData);
      if (signals && signals.length > 0) {
        result.data.signals = signals;
      }
    } catch (signalsError) {
      console.log('[Lusha Everywhere] Signals fetch failed (non-critical):', signalsError.message);
      // Don't fail the whole request if signals fail
    }
  }

  return result;
}

function parseName(fullName, extractedCompany) {
  const name = fullName.trim();
  let parts = name.split(/\s+/);

  // If we have an extracted company, the full selection is just the name
  if (extractedCompany) {
    // Remove company from name if it's included
    const nameWithoutCompany = name.replace(new RegExp(extractedCompany, 'i'), '').trim();
    parts = nameWithoutCompany.split(/\s+/).filter(p => p.length > 0);

    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || parts[0] || '',
      company: extractedCompany
    };
  }

  // No extracted company - try to parse from selection
  // Common patterns: "John Doe Company" or "John Doe at Company"

  // Check for "at Company" or "from Company" pattern
  const atMatch = name.match(/^(.+?)\s+(?:at|from|@)\s+(.+)$/i);
  if (atMatch) {
    const nameParts = atMatch[1].trim().split(/\s+/);
    return {
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || nameParts[0],
      company: atMatch[2].trim()
    };
  }

  // Check for "John Doe - Company" pattern
  const dashMatch = name.match(/^(.+?)\s*[-]\s*(.+)$/);
  if (dashMatch) {
    const nameParts = dashMatch[1].trim().split(/\s+/);
    return {
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || nameParts[0],
      company: dashMatch[2].trim()
    };
  }

  // Default: First word is firstName, middle is lastName, last MIGHT be company
  // If last word starts with uppercase and previous is also uppercase, might be company
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];

    // Heuristic: If last word looks like a company (short, capitalized, not common last name)
    const commonLastNames = ['smith', 'johnson', 'jones', 'brown', 'williams', 'davis', 'miller', 'wilson', 'moore', 'taylor', 'anderson', 'thomas', 'jackson', 'white', 'harris', 'martin', 'thompson', 'garcia', 'martinez', 'robinson', 'clark', 'rodriguez', 'lewis', 'lee', 'walker', 'hall', 'allen', 'young', 'hernandez', 'king', 'wright', 'lopez', 'hill', 'scott', 'green', 'adams', 'baker', 'gonzalez', 'nelson', 'carter', 'mitchell', 'perez', 'roberts', 'turner', 'phillips', 'campbell', 'parker', 'evans', 'edwards', 'collins', 'stewart', 'sanchez', 'morris', 'rogers', 'reed', 'cook', 'morgan', 'bell', 'murphy', 'bailey', 'rivera', 'cooper', 'richardson', 'cox', 'howard', 'ward', 'torres', 'peterson', 'gray', 'ramirez', 'james', 'watson', 'brooks', 'kelly', 'sanders', 'price', 'bennett', 'wood', 'barnes', 'ross', 'henderson', 'coleman', 'jenkins', 'perry', 'powell', 'long', 'patterson', 'hughes', 'flores', 'washington', 'butler', 'simmons', 'foster', 'gonzales', 'bryant', 'alexander', 'russell', 'griffin', 'diaz', 'hayes'];

    const isLastPartCompany = !commonLastNames.includes(lastPart.toLowerCase()) &&
      /^[A-Z]/.test(lastPart) &&
      lastPart.length >= 2;

    if (isLastPartCompany) {
      return {
        firstName: parts[0],
        lastName: parts.slice(1, -1).join(' '),
        company: lastPart
      };
    }
  }

  // No company detected
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    company: null
  };
}

function extractEmail(data) {
  if (data.emailAddresses && data.emailAddresses.length > 0) {
    return data.emailAddresses[0].email;
  }
  return data.email || null;
}

function extractEmails(data) {
  const emails = [];

  if (data.emailAddresses && Array.isArray(data.emailAddresses)) {
    emails.push(...data.emailAddresses.map(e => e.email || e).filter(Boolean));
  } else if (data.email) {
    emails.push(data.email);
  }

  return emails.length > 0 ? emails : null;
}

function extractPhone(data) {
  if (data.phoneNumbers && data.phoneNumbers.length > 0) {
    const phone = data.phoneNumbers[0];
    return phone.internationalPhoneNumber || phone.number || phone.localNumber;
  }
  return data.phone || null;
}

function extractPhones(data) {
  const phones = [];

  if (data.phoneNumbers && Array.isArray(data.phoneNumbers)) {
    for (const phone of data.phoneNumbers) {
      const number = phone.internationalPhoneNumber || phone.number || phone.localNumber;
      if (number) {
        phones.push({
          number: number,
          type: phone.type || 'unknown'
        });
      }
    }
  } else if (data.phone) {
    phones.push({
      number: data.phone,
      type: 'unknown'
    });
  }

  return phones.length > 0 ? phones : null;
}

function extractCompany(data) {
  if (data.company && data.company.name) {
    return data.company.name;
  }
  return data.companyName || data.company || null;
}

function extractPosition(data) {
  if (data.jobTitle && data.jobTitle.title) {
    return data.jobTitle.title;
  }
  return data.position || data.title || data.jobTitle || null;
}

function extractLinkedInUrl(data) {
  // Try different possible locations for LinkedIn URL

  // Check socialLinks.linkedin (new API format)
  if (data.socialLinks && data.socialLinks.linkedin) {
    return data.socialLinks.linkedin;
  }

  // Check direct linkedInUrl field
  if (data.linkedInUrl) {
    return data.linkedInUrl;
  }

  // Check socialProfiles array (old API format)
  if (data.socialProfiles && Array.isArray(data.socialProfiles)) {
    const linkedIn = data.socialProfiles.find(p =>
      p.type?.toLowerCase() === 'linkedin' ||
      p.url?.includes('linkedin.com')
    );
    if (linkedIn) {
      return linkedIn.url;
    }
  }

  return null;
}

function extractSeniority(data) {
  // Could be in jobTitle.seniority or seniority field
  if (data.jobTitle && data.jobTitle.seniority) {
    return data.jobTitle.seniority;
  }
  if (data.seniority) {
    return data.seniority;
  }
  return null;
}

function extractDepartment(data) {
  // Could be in jobTitle.department or department field
  if (data.jobTitle && data.jobTitle.department) {
    return data.jobTitle.department;
  }
  if (data.department) {
    return data.department;
  }
  return null;
}

function extractLocation(data) {
  // Try different location fields
  if (data.location) {
    if (typeof data.location === 'string') {
      return data.location;
    }
    // Location object with city, country, etc.
    const parts = [];
    if (data.location.city) parts.push(data.location.city);
    if (data.location.region) parts.push(data.location.region);
    if (data.location.country) parts.push(data.location.country);
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }

  if (data.city || data.country) {
    const parts = [];
    if (data.city) parts.push(data.city);
    if (data.country) parts.push(data.country);
    return parts.join(', ');
  }

  return null;
}

// Fetch Signals from Lusha API (new API endpoint)
async function fetchSignals(entityId, apiKey, entityType, entityData = {}) {
  console.log('[Lusha Everywhere] Fetching signals for:', entityType, entityId, entityData);

  // New Signals API endpoints
  const endpoint = entityType === 'person'
    ? 'https://api.lusha.com/api/signals/contacts/search'
    : 'https://api.lusha.com/api/signals/companies/search';

  try {
    let requestBody;

    if (entityType === 'person') {
      // Build contact object for signals API
      const contact = {
        id: 'signal-request-1',
      };

      // Prefer LinkedIn URL if available
      if (entityData.linkedInUrl) {
        contact.social_link = entityData.linkedInUrl;
      } else if (entityData.fullName && entityData.companyName) {
        contact.full_name = entityData.fullName;
        contact.companies = [{ name: entityData.companyName }];
      } else {
        // Not enough data for signals API
        console.log('[Lusha Everywhere] Insufficient data for signals API');
        return null;
      }

      requestBody = {
        contacts: [contact],
        signals: ['allSignals']
      };
    } else {
      // Company signals
      const company = {
        id: 'signal-request-1'
      };

      if (entityData.domain) {
        company.domain = entityData.domain;
      } else if (entityData.name) {
        company.name = entityData.name;
      } else {
        console.log('[Lusha Everywhere] Insufficient data for company signals API');
        return null;
      }

      requestBody = {
        companies: [company],
        signals: ['allSignals']
      };
    }

    console.log('[Lusha Everywhere] Signals request:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'api_key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[Lusha Everywhere] Signals response status:', response.status);

    if (response.status === 404) {
      // No signals found - this is OK
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Lusha Everywhere] Signals API error:', errorText);
      // Don't throw - signals are non-critical
      return null;
    }

    const data = await response.json();
    console.log('[Lusha Everywhere] Signals data:', JSON.stringify(data, null, 2));

    // Extract signals from new API response format
    const entityKey = entityType === 'person' ? 'contacts' : 'companies';
    const entitySignals = data[entityKey]?.['signal-request-1'];

    if (!entitySignals) {
      console.log('[Lusha Everywhere] No signals found in response');
      return null;
    }

    // Format signals for display
    const allSignals = [];

    // Company change signals (for persons)
    if (entitySignals.companyChange && Array.isArray(entitySignals.companyChange)) {
      entitySignals.companyChange.forEach(signal => {
        allSignals.push({
          type: 'companyChange',
          title: 'Changed Company',
          description: `Moved from ${signal.previousCompanyName || 'previous company'} to ${signal.currentCompanyName}`,
          date: signal.signalDate,
          metadata: {
            currentCompany: signal.currentCompanyName,
            currentTitle: signal.currentTitle,
            currentDomain: signal.currentDomain,
            previousCompany: signal.previousCompanyName,
            previousDomain: signal.previousDomain,
            departments: signal.currentDepartments,
            seniority: signal.currentSeniorityLabel
          }
        });
      });
    }

    // Promotion signals (for persons)
    if (entitySignals.promotion && Array.isArray(entitySignals.promotion)) {
      entitySignals.promotion.forEach(signal => {
        allSignals.push({
          type: 'promotion',
          title: 'Got Promoted',
          description: `Promoted from ${signal.previousTitle || 'previous role'} to ${signal.currentTitle}`,
          date: signal.signalDate,
          metadata: {
            currentTitle: signal.currentTitle,
            previousTitle: signal.previousTitle,
            companyName: signal.companyName
          }
        });
      });
    }

    // Company signals - New Jobs Open
    if (entitySignals.newJobsOpen && Array.isArray(entitySignals.newJobsOpen)) {
      entitySignals.newJobsOpen.forEach(signal => {
        allSignals.push({
          type: 'newJobsOpen',
          title: 'New Jobs Posted',
          description: `${signal.newValue || 'Multiple'} new job openings (${signal.score || 'low'} signal strength)`,
          date: signal.signalDate,
          metadata: signal
        });
      });
    }

    // Company signals - News Events
    if (entitySignals.newsEvent && Array.isArray(entitySignals.newsEvent)) {
      entitySignals.newsEvent.forEach(signal => {
        allSignals.push({
          type: 'newsEvent',
          title: signal.articleTitle || signal.eventType || 'News Event',
          description: signal.eventSummary || signal.articleSentence || '',
          date: signal.articlePublishedDate || signal.signalDate,
          url: signal.articleUrl,
          metadata: {
            eventType: signal.eventType,
            eventCategory: signal.eventCategory,
            eventEffectiveDate: signal.eventEffectiveDate
          }
        });
      });
    }

    // Company signals - Headcount Growth
    if (entitySignals.headcountGrowth && Array.isArray(entitySignals.headcountGrowth)) {
      entitySignals.headcountGrowth.forEach(signal => {
        allSignals.push({
          type: 'headcountGrowth',
          title: 'Headcount Growth',
          description: `Company headcount increased (${signal.score || 'low'} signal strength)`,
          date: signal.signalDate,
          metadata: signal
        });
      });
    }

    // Company signals - Funding (if exists)
    if (entitySignals.funding && Array.isArray(entitySignals.funding)) {
      entitySignals.funding.forEach(signal => {
        allSignals.push({
          type: 'funding',
          title: 'Funding Event',
          description: signal.description || `Raised ${signal.amount}`,
          date: signal.signalDate,
          metadata: signal
        });
      });
    }

    // Company signals - Growth (if exists)
    if (entitySignals.growth && Array.isArray(entitySignals.growth)) {
      entitySignals.growth.forEach(signal => {
        allSignals.push({
          type: 'growth',
          title: 'Company Growth',
          description: signal.description || 'Company showing growth signals',
          date: signal.signalDate,
          metadata: signal
        });
      });
    }

    console.log('[Lusha Everywhere] Formatted signals:', allSignals.length, 'signals found');

    // Sort signals by date - newest first
    if (allSignals.length > 0) {
      allSignals.sort((a, b) => {
        const dateA = a.date ? new Date(a.date) : new Date(0);
        const dateB = b.date ? new Date(b.date) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });
    }

    return allSignals.length > 0 ? allSignals : null;

  } catch (error) {
    console.error('[Lusha Everywhere] Error fetching signals:', error);
    // Don't throw - signals are non-critical
    return null;
  }
}
