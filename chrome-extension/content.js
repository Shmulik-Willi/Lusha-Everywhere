// content.js - Runs on every page and handles text selection

console.log('[Lusha Everywhere] Content script loaded on:', window.location.href);

let selectionButton = null;
let resultPopup = null;
let currentApiKey = null;
let lastSelectionPosition = { x: 0, y: 0 };

// Load API Key on page load
chrome.storage.sync.get('lushaApiKey', ({ lushaApiKey }) => {
  currentApiKey = lushaApiKey;
  console.log('[Lusha Everywhere] API Key loaded:', !!lushaApiKey);
});

// Listen for API Key updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'API_KEY_UPDATED') {
    currentApiKey = message.apiKey;
    console.log('[Lusha Everywhere] API Key updated');
  }
});

// Listen for text selection
document.addEventListener('mouseup', (e) => {
  // If clicking inside our popup or button, ignore
  if (e.target.closest('.lusha-result-popup') ||
    e.target.closest('.lusha-selection-container')) {
    return;
  }

  handleTextSelection(e);
});
document.addEventListener('selectionchange', handleSelectionChange);

function handleTextSelection(e) {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  // Remove existing button
  removeSelectionButton();

  if (selectedText.length > 0 && selectedText.length < 150) {
    // Check if it looks like a name or company
    const words = selectedText.split(/\s+/);
    const hasLetters = /[a-zA-Z]/.test(selectedText);
    const notJustNumbers = !/^\d+$/.test(selectedText);

    const isValidSelection = (words.length >= 2 && hasLetters) ||
      (words.length === 1 && /^[A-Za-z]/.test(selectedText) && selectedText.length > 2);

    if (isValidSelection && notJustNumbers) {
      lastSelectionPosition = { x: e.clientX, y: e.clientY };

      let selectionElement = null;
      try {
        const range = selection.getRangeAt(0);
        selectionElement = range.commonAncestorContainer.parentElement;
      } catch (err) {
        console.log('[Lusha Everywhere] Could not get selection element');
      }

      showSelectionButton(e.clientX, e.clientY, selectedText, selectionElement);
    }
  }
}

function handleSelectionChange() {
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) {
    removeSelectionButton();
  }
}

function showSelectionButton(x, y, selectedText, selectionElement) {
  selectionButton = document.createElement('div');
  selectionButton.className = 'lusha-selection-container';
  selectionButton.innerHTML = `
    <button class="lusha-selection-btn" id="lusha-btn-person" title="Enrich Person">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      Person
    </button>
    <div class="lusha-divider"></div>
    <button class="lusha-selection-btn" id="lusha-btn-company" title="Enrich Company">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
      </svg>
      Company
    </button>
  `;

  selectionButton.style.position = 'fixed';
  selectionButton.style.left = `${x}px`;
  selectionButton.style.top = `${y - 50}px`;
  selectionButton.style.zIndex = '2147483647';

  document.body.appendChild(selectionButton);

  const personBtn = selectionButton.querySelector('#lusha-btn-person');
  const companyBtn = selectionButton.querySelector('#lusha-btn-company');

  if (personBtn) {
    personBtn.addEventListener('click', async (e) => {
      console.log('[Lusha Everywhere] Person button clicked for:', selectedText);
      e.preventDefault();
      e.stopPropagation();
      await enrichContact(selectedText, selectionElement);
    });
  }

  if (companyBtn) {
    companyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await enrichCompanyDirectly(selectedText);
    });
  }

  requestAnimationFrame(() => {
    if (!selectionButton) return;
    const rect = selectionButton.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      selectionButton.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.left < 0) {
      selectionButton.style.left = '10px';
    }
    if (rect.top < 0) {
      selectionButton.style.top = `${y + 20}px`;
    }
  });
}

async function enrichCompanyDirectly(companyName) {
  showLoadingPopup(`Searching for company: ${companyName}...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ENRICH_COMPANY',
      companyName: companyName,
      apiKey: currentApiKey
    });
    if (response) {
      if (!response.data) response.data = {};
      response.data._initialQuery = { type: 'company', name: companyName };
    }
    if (response && response.success) {
      showResultPopup(response.data);
    } else {
      showResultPopup({
        error: true,
        message: response?.error || 'No company found',
        type: 'company',
        _initialQuery: { type: 'company', name: companyName },
        name: companyName
      });
    }
  } catch (err) {
    showResultPopup({
      error: true,
      message: err.message,
      type: 'company',
      _initialQuery: { type: 'company', name: companyName },
      name: companyName
    });
  }
}

function removeSelectionButton() {
  if (selectionButton) {
    selectionButton.remove();
    selectionButton = null;
  }
}

async function enrichContact(name, selectionElement) {
  console.log('[Lusha Everywhere] enrichContact called with name:', name);
  console.log('[Lusha Everywhere] Current API Key:', currentApiKey ? 'SET' : 'NOT SET');
  showLoadingPopup('Extracting info from page...');
  try {
    let extractedCompany = null;
    if (typeof window.extractCompanyFromPage === 'function') {
      try {
        extractedCompany = window.extractCompanyFromPage(name, selectionElement);
      } catch (err) { }
    }

    if (extractedCompany) {
      updateLoadingMessage(`Searching for ${name} at ${extractedCompany}...`);
    } else {
      updateLoadingMessage(`Searching for ${name}...`);
    }

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'ENRICH_CONTACT',
        name: name,
        apiKey: currentApiKey,
        extractedCompany: extractedCompany
      });
    } catch (sendError) {
      if (sendError.message && sendError.message.includes('Extension context invalidated')) {
        showResultPopup({
          error: true,
          message: '⚠️ Extension was reloaded.\n\nPlease refresh this page (F5) and try again.',
          _initialQuery: { type: 'person', name: name, extractedCompany: extractedCompany }
        });
        return;
      }
      throw sendError;
    }

    const initialQueryData = { type: 'person', name: name, extractedCompany: extractedCompany };

    if (response && response.success) {
      if (extractedCompany && !response.data.company) {
        response.data.company = extractedCompany;
        response.data._companySource = 'page';
      }
      response.data._initialQuery = initialQueryData;
      showResultPopup(response.data);
    } else {
      showResultPopup({
        error: true,
        message: response?.error || 'Failed to get data from Lusha. Try refining your search.',
        _initialQuery: initialQueryData
      });
    }
  } catch (error) {
    let errorMessage = error.message || 'Connection error';
    if (errorMessage.includes('Extension context invalidated')) {
      errorMessage = '⚠️ Extension was reloaded.\n\nPlease refresh this page (F5) and try again.';
    }
    showResultPopup({
      error: true,
      message: errorMessage,
      _initialQuery: { type: 'person', name: name, extractedCompany: null }
    });
  }
}

function showLoadingPopup(message = 'Searching...') {
  console.log('[Lusha Everywhere] showLoadingPopup called with message:', message);
  removeResultPopup();
  let posX = lastSelectionPosition.x;
  let posY = lastSelectionPosition.y;
  if (selectionButton) {
    const buttonRect = selectionButton.getBoundingClientRect();
    posX = buttonRect.left;
    posY = buttonRect.bottom + 10;
  }
  resultPopup = document.createElement('div');
  resultPopup.className = 'lusha-result-popup loading';
  resultPopup.innerHTML = `
    <div class="lusha-loading-spinner"></div>
    <p id="lusha-loading-message">${message}</p>
  `;
  resultPopup.style.position = 'fixed';
  resultPopup.style.left = `${posX}px`;
  resultPopup.style.top = `${posY}px`;
  resultPopup.style.zIndex = '2147483647';
  document.body.appendChild(resultPopup);
  requestAnimationFrame(() => {
    if (!resultPopup) return;
    const rect = resultPopup.getBoundingClientRect();
    if (rect.right > window.innerWidth) resultPopup.style.left = `${window.innerWidth - rect.width - 10}px`;
    if (rect.bottom > window.innerHeight) resultPopup.style.top = `${posY - rect.height - 60}px`;
  });
}

function updateLoadingMessage(message) {
  const messageEl = document.getElementById('lusha-loading-message');
  if (messageEl) messageEl.textContent = message;
}

function showResultPopup(data) {
  removeResultPopup();
  resultPopup = document.createElement('div');
  resultPopup.className = 'lusha-result-popup';

  if (data.error) {
    resultPopup.innerHTML = `
      <div class="lusha-result-header error">
        <span class="lusha-result-icon">⚠️</span>
        <span>Search Unsuccessful</span>
        <button class="lusha-close-button">&times;</button>
      </div>
      <div class="lusha-result-content">
        <div class="lusha-error-message">${escapeHtml(data.message)}</div>
      </div>
      <div class="lusha-result-footer">
        <button class="lusha-refine-btn" id="lusha-refine-btn">Refine Search</button>
      </div>
    `;
  } else if (data.type === 'company' || (data.company && typeof data.company === 'object')) {
    // --- COMPANY VIEW ---
    const company = data.type === 'company' ? data : data.company;
    let descriptionHtml = '';
    if (company.description) {
      if (company.description.length > 100) {
        descriptionHtml = `
          <div class="lusha-result-item lusha-description-container">
            <span class="lusha-result-label">Description:</span>
            <span class="lusha-result-value">
              <span class="lusha-desc-short">${escapeHtml(company.description.substring(0, 100))}...</span>
              <span class="lusha-desc-full" style="display: none;">${escapeHtml(company.description)}</span>
              <a href="#" class="lusha-read-more">Read more</a>
            </span>
          </div>`;
      } else {
        descriptionHtml = `
          <div class="lusha-result-item">
            <span class="lusha-result-label">Description:</span>
            <span class="lusha-result-value">${escapeHtml(company.description)}</span>
          </div>`;
      }
    }

    resultPopup.innerHTML = `
      <div class="lusha-result-header">
        <span class="lusha-result-icon">&#10003;</span>
        <span>Company Found</span>
        <button class="lusha-close-button">&times;</button>
      </div>
      <div class="lusha-result-content">
        <div class="lusha-result-item">
          <span class="lusha-result-label">Name:</span>
          <span class="lusha-result-value" style="display: flex; align-items: center; gap: 8px;">
            <span>${escapeHtml(company.display_name || company.name)}</span>
            ${getCompanyLinkedInButton(company)}
          </span>
        </div>
        ${(company.domain || company.website) ? `
          <div class="lusha-result-item">
            <span class="lusha-result-label">Website:</span>
            <span class="lusha-result-value"><a href="https://${escapeHtml(company.domain || company.website)}" target="_blank" class="lusha-link">${escapeHtml(company.domain || company.website)}</a></span>
          </div>` : ''}
        ${(company.revenue && company.revenue.toString().trim()) ? `
          <div class="lusha-result-item">
            <span class="lusha-result-label">Revenue:</span>
            <span class="lusha-result-value">${escapeHtml(company.revenue)}</span>
          </div>` : ''}
        ${(company.industry && company.industry.toString().trim()) ? `
          <div class="lusha-result-item">
            <span class="lusha-result-label">Primary Industry:</span>
            <span class="lusha-result-value">${escapeHtml(company.industry)}</span>
          </div>` : ''}
        ${(company.employees && company.employees.toString().trim()) ? `
          <div class="lusha-result-item">
            <span class="lusha-result-label">Employees:</span>
            <span class="lusha-result-value">${escapeHtml(formatEmployeeRange(company.employees))}</span>
          </div>` : ''}
        ${(company.founded && company.founded.toString().trim()) ? `
          <div class="lusha-result-item">
            <span class="lusha-result-label">Founded:</span>
            <span class="lusha-result-value">${escapeHtml(company.founded)}</span>
          </div>` : ''}
        ${(company.headquarters && company.headquarters.toString().trim()) ? `
          <div class="lusha-result-item">
            <span class="lusha-result-label">HQ:</span>
            <span class="lusha-result-value">${escapeHtml(company.headquarters)}</span>
          </div>` : ''}
        ${descriptionHtml}
        ${renderSignals(company.signals || data.signals)}
      </div>
      <div class="lusha-result-footer">
        <button class="lusha-refine-btn" id="lusha-refine-btn">Refine Search</button>
      </div>
    `;
  } else {
    // --- PERSON VIEW ---
    let emailsHtml = '';
    if (data.emails && data.emails.length > 0) {
      emailsHtml = data.emails.map((email, index) => {
        if (!email || !email.trim()) return '';
        return `
          <div class="lusha-result-item">
            <span class="lusha-result-label">${index === 0 ? 'Email:' : ''}</span>
            <span class="lusha-result-value" style="display: flex; align-items: center; gap: 8px;">
              <a href="mailto:${escapeHtml(email)}" class="lusha-link">${escapeHtml(email)}</a>
              <a href="mailto:${escapeHtml(email)}" class="lusha-action-btn" title="Send Email" onclick="event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </a>
            </span>
          </div>`;
      }).join('');
    } else if (data.email && data.email.trim()) {
      emailsHtml = `
        <div class="lusha-result-item">
          <span class="lusha-result-label">Email:</span>
          <span class="lusha-result-value" style="display: flex; align-items: center; gap: 8px;">
            <a href="mailto:${escapeHtml(data.email)}" class="lusha-link">${escapeHtml(data.email)}</a>
            <a href="mailto:${escapeHtml(data.email)}" class="lusha-action-btn" title="Send Email" onclick="event.stopPropagation()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </a>
          </span>
        </div>`;
    }

    const phones = data.phones || (data.phone ? [{ number: data.phone, type: 'unknown' }] : []);
    let phonesHtml = '';

    if (phones.length > 0) {
      phonesHtml = phones.map((phone, index) => {
        if (!phone.number || !phone.number.trim()) return '';
        const pType = (phone.type || '').toLowerCase();
        const cleanNumber = phone.number.replace(/\D/g, '');
        const whatsappBtn = cleanNumber ? `
          <a href="https://web.whatsapp.com/send?phone=${cleanNumber}" target="_blank" class="lusha-action-btn lusha-whatsapp-btn" title="Chat on WhatsApp" onclick="event.stopPropagation()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>` : '';

        return `
          <div class="lusha-result-item">
            <span class="lusha-result-label">${index === 0 ? 'Phone:' : ''}</span>
            <span class="lusha-result-value" style="display: flex; align-items: center; gap: 8px;">
              <a href="tel:${escapeHtml(phone.number)}" class="lusha-link">${escapeHtml(phone.number)}</a>
              ${phone.type && phone.type !== 'unknown' ? `<span class="lusha-phone-type">${escapeHtml(phone.type)}</span>` : ''}
              ${whatsappBtn}
            </span>
          </div>`;
      }).join('');
    }

    resultPopup.innerHTML = `
      <div class="lusha-result-header">
        <span class="lusha-result-icon">&#10003;</span>
        <span>Contact Found</span>
        <button class="lusha-close-button">&times;</button>
      </div>
      <div class="lusha-result-content">
        ${(data.name && data.name.toString().trim()) ? `
          <div class="lusha-result-item">
            <span class="lusha-result-label">Name:</span>
            <span class="lusha-result-value" style="display: flex; align-items: center; gap: 8px;">
              <span>${escapeHtml(data.name)}</span>
              ${getPersonLinkedInButton(data)}
            </span>
          </div>
        ` : ''}
        ${emailsHtml}
        ${phonesHtml}
        ${(data.company && data.company.toString().trim()) ? `<div class="lusha-result-item"><span class="lusha-result-label">Company:</span><span class="lusha-result-value">${escapeHtml(data.company)}</span></div>` : ''}
        ${(data.position && data.position.toString().trim()) ? `<div class="lusha-result-item"><span class="lusha-result-label">Position:</span><span class="lusha-result-value">${escapeHtml(data.position)}</span></div>` : ((data.title && data.title.toString().trim()) ? `<div class="lusha-result-item"><span class="lusha-result-label">Title:</span><span class="lusha-result-value">${escapeHtml(data.title)}</span></div>` : '')}
        ${(data.department && data.department.toString().trim()) ? `<div class="lusha-result-item"><span class="lusha-result-label">Department:</span><span class="lusha-result-value">${escapeHtml(data.department)}</span></div>` : ''}
        ${(data.seniority && data.seniority.toString().trim()) ? `<div class="lusha-result-item"><span class="lusha-result-label">Seniority:</span><span class="lusha-result-value">${escapeHtml(data.seniority)}</span></div>` : ''}
        ${(data.location && data.location.toString().trim()) ? `<div class="lusha-result-item"><span class="lusha-result-label">Location:</span><span class="lusha-result-value">${escapeHtml(data.location)}</span></div>` : ''}
        ${renderSignals(data.signals)}
      </div>
      <div class="lusha-result-footer">
        <button class="lusha-refine-btn" id="lusha-refine-btn">Refine Search</button>
      </div>
    `;
  }

  // Common UI logic
  document.body.appendChild(resultPopup);
  document.addEventListener('click', handleOutsideClick);

  // Prevent body scroll when popup is open
  document.body.style.overflow = 'hidden';

  resultPopup.querySelector('.lusha-close-button').addEventListener('click', removeResultPopup);

  const refineBtn = resultPopup.querySelector('#lusha-refine-btn');
  if (refineBtn) {
    refineBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderEditForm(data);
    });
  }

  const readMore = resultPopup.querySelector('.lusha-read-more');
  if (readMore) {
    readMore.addEventListener('click', (e) => {
      e.preventDefault();
      const container = e.target.closest('.lusha-description-container');
      if (container) {
        container.querySelector('.lusha-desc-short').style.display = 'none';
        container.querySelector('.lusha-desc-full').style.display = 'inline';
        e.target.style.display = 'none';
      }
    });
  }

  // Positioning
  const posX = lastSelectionPosition.x;
  const posY = lastSelectionPosition.y;
  resultPopup.style.position = 'fixed';
  resultPopup.style.left = `${posX}px`;
  resultPopup.style.top = `${posY + 20}px`;
  resultPopup.style.zIndex = '2147483647';

  requestAnimationFrame(() => {
    if (!resultPopup) return;
    const rect = resultPopup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 20;

    let targetLeft = lastSelectionPosition.x;
    let targetTop = lastSelectionPosition.y + 20;

    // Horizontal check
    if (targetLeft + rect.width > viewportWidth - margin) {
      targetLeft = Math.max(margin, viewportWidth - rect.width - margin);
    }
    if (targetLeft < margin) targetLeft = margin;

    // Vertical check
    if (targetTop + rect.height > viewportHeight - margin) {
      // If doesn't fit below, try above selection
      const aboveTop = lastSelectionPosition.y - rect.height - 20;
      if (aboveTop > margin) {
        targetTop = aboveTop;
      } else {
        // Doesn't fit above either, pin to bottom with margin
        targetTop = Math.max(margin, viewportHeight - rect.height - margin);
      }
    }

    resultPopup.style.left = `${targetLeft}px`;
    resultPopup.style.top = `${targetTop}px`;

    // Ensure the content area can scroll if the whole popup is constrained by max-height (85vh)
    const content = resultPopup.querySelector('.lusha-result-content');
    if (content) {
      content.style.maxHeight = 'calc(85vh - 120px)'; // Account for header/footer
    }
  });
}

function renderEditForm(initialData) {
  if (!resultPopup) return;
  const content = resultPopup.querySelector('.lusha-result-content');
  if (!content) return;

  const queryData = initialData._initialQuery || initialData;
  let isCompanyMode = queryData.type === 'company' || initialData.type === 'company';
  let firstName = '', lastName = '', companyName = '';

  if (queryData.extractedCompany) companyName = queryData.extractedCompany;
  if (queryData.name) {
    if (isCompanyMode) companyName = queryData.name;
    else {
      const parts = queryData.name.trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
  }
  if (initialData.company && typeof initialData.company === 'string' && !companyName) companyName = initialData.company;
  if (initialData.name && isCompanyMode && !companyName) companyName = initialData.name;

  content.innerHTML = `
    <div class="lusha-edit-form">
      <div class="lusha-toggle-group">
        <button class="lusha-toggle-btn ${!isCompanyMode ? 'active' : ''}" data-mode="person">Person</button>
        <button class="lusha-toggle-btn ${isCompanyMode ? 'active' : ''}" data-mode="company">Company</button>
      </div>
      <div id="lusha-person-inputs" style="display: ${!isCompanyMode ? 'block' : 'none'};">
        <div class="lusha-input-group"><label class="lusha-input-label">First Name <span class="lusha-required">*</span></label><input type="text" class="lusha-input" id="lusha-first-name" value="${escapeHtml(firstName)}"></div>
        <div class="lusha-input-group"><label class="lusha-input-label">Last Name <span class="lusha-required">*</span></label><input type="text" class="lusha-input" id="lusha-last-name" value="${escapeHtml(lastName)}"></div>
      </div>
      <div class="lusha-input-group">
        <label class="lusha-input-label">Company Name / Domain <span class="lusha-required" id="lusha-company-required" style="display: ${isCompanyMode ? 'inline' : 'none'};">*</span></label>
        <input type="text" class="lusha-input" id="lusha-company-name" value="${escapeHtml(companyName)}" placeholder="e.g. Apple or apple.com">
      </div>
      <div class="lusha-actions">
        <button class="lusha-btn lusha-btn-secondary" id="lusha-cancel-edit">Cancel</button>
        <button class="lusha-btn lusha-btn-primary" id="lusha-search-btn">Search</button>
      </div>
    </div>`;

  const footer = resultPopup.querySelector('.lusha-result-footer');
  if (footer) footer.style.display = 'none'; // Hide instead of remove to avoid layout shifts if we go back

  const toggleBtns = content.querySelectorAll('.lusha-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      isCompanyMode = e.target.dataset.mode === 'company';
      toggleBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('lusha-person-inputs').style.display = isCompanyMode ? 'none' : 'block';
      document.getElementById('lusha-company-required').style.display = isCompanyMode ? 'inline' : 'none';
    });
  });

  document.getElementById('lusha-cancel-edit').addEventListener('click', () => {
    if (footer) footer.style.display = '';
    showResultPopup(initialData);
  });

  document.getElementById('lusha-search-btn').addEventListener('click', async () => {
    const companyVal = document.getElementById('lusha-company-name').value.trim();
    if (isCompanyMode) {
      if (!companyVal) return;
      showLoadingPopup(`Searching for company: ${companyVal}...`);
      const response = await chrome.runtime.sendMessage({ type: 'ENRICH_COMPANY', companyName: companyVal, apiKey: currentApiKey });
      if (response && response.data) response.data._initialQuery = { type: 'company', name: companyVal };
      showResultPopup(response && response.success ? response.data : { error: true, message: response?.error || 'No company found', type: 'company', _initialQuery: { type: 'company', name: companyVal }, name: companyVal });
    } else {
      const firstVal = document.getElementById('lusha-first-name').value.trim();
      const lastVal = document.getElementById('lusha-last-name').value.trim();
      if (!firstVal || !lastVal) return;
      const fullName = `${firstVal} ${lastVal}`.trim();
      showLoadingPopup(`Searching for ${fullName}...`);
      const response = await chrome.runtime.sendMessage({ type: 'ENRICH_CONTACT', name: fullName, apiKey: currentApiKey, extractedCompany: companyVal });
      if (response && response.data) response.data._initialQuery = { type: 'person', name: fullName, extractedCompany: companyVal };
      showResultPopup(response && response.success ? response.data : { error: true, message: response?.error || 'No contact found', _initialQuery: { type: 'person', name: fullName, extractedCompany: companyVal } });
    }
  });
}

function handleOutsideClick(e) {
  if (!resultPopup?.contains(e.target) && !selectionButton?.contains(e.target)) {
    removeResultPopup();
    removeSelectionButton();
  }
}

function removeResultPopup() {
  if (resultPopup) {
    resultPopup.remove();
    resultPopup = null;
  }
  document.removeEventListener('click', handleOutsideClick);

  // Restore body scroll
  document.body.style.overflow = '';
}

function formatNumber(num) {
  if (!num) return '';
  const n = parseInt(num.toString().replace(/\D/g, ''), 10);
  if (isNaN(n)) return num;

  if (n >= 1000000) {
    const millions = n / 1000000;
    // If it's a whole number of millions, don't show decimal
    if (millions === Math.floor(millions)) {
      return millions + 'M';
    }
    // Otherwise show up to 1 decimal place
    return millions.toFixed(1).replace(/\.0$/, '') + 'M';
  }

  return n.toLocaleString();
}

function formatEmployeeRange(range) {
  if (!range || typeof range !== 'string') return range;
  if (!range.includes('-')) return formatNumber(range);
  return range.split('-').map(part => formatNumber(part.trim())).join(' - ');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getPersonLinkedInButton(data) {
  // Only show button if we have a real LinkedIn URL from Lusha API
  if (!data.linkedInUrl || !data.linkedInUrl.toString().trim()) {
    return '';
  }

  return `
    <a href="${escapeHtml(data.linkedInUrl)}" target="_blank" class="lusha-action-btn" title="View LinkedIn Profile" onclick="event.stopPropagation()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
      </svg>
    </a>
  `;
}

function getCompanyLinkedInButton(company) {
  // Check for LinkedIn in social profiles from Lusha API
  let linkedInUrl = null;

  if (company.social && Array.isArray(company.social)) {
    const linkedInProfile = company.social.find(s =>
      s.type && s.type.toLowerCase() === 'linkedin'
    );
    if (linkedInProfile && linkedInProfile.url) {
      linkedInUrl = linkedInProfile.url;
    }
  }

  // Fallback to direct linkedin field
  if (!linkedInUrl && company.linkedin) {
    linkedInUrl = company.linkedin;
  }

  // Only show button if we have a real LinkedIn URL from Lusha API
  if (!linkedInUrl) {
    return '';
  }

  return `
    <a href="${escapeHtml(linkedInUrl)}" target="_blank" class="lusha-action-btn" title="View LinkedIn Profile" onclick="event.stopPropagation()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
      </svg>
    </a>
  `;
}

// Render Signals section
function renderSignals(signals) {
  if (!signals || !Array.isArray(signals) || signals.length === 0) {
    return '';
  }

  const signalsHtml = signals.map(signal => {
    const signalType = signal.type || 'info';
    const signalTitle = signal.title || 'Signal';
    const signalDescription = signal.description || '';
    const signalDate = signal.date ? new Date(signal.date).toLocaleDateString() : '';
    const signalUrl = signal.url || '';

    // Choose emoji based on signal type
    let emoji = '📊';
    if (signalType === 'companyChange' || signalType.toLowerCase().includes('move')) emoji = '🔄';
    else if (signalType === 'promotion') emoji = '📈';
    else if (signalType === 'newJobsOpen' || signalType.toLowerCase().includes('job')) emoji = '💼';
    else if (signalType === 'newsEvent' || signalType.toLowerCase().includes('news')) emoji = '📰';
    else if (signalType === 'funding' || signalType.toLowerCase().includes('funding')) emoji = '💰';
    else if (signalType === 'growth' || signalType.toLowerCase().includes('growth')) emoji = '📊';
    else if (signalType.toLowerCase().includes('award')) emoji = '🏆';

    return `
      <div class="lusha-signal-item">
        <div class="lusha-signal-header">
          <span class="lusha-signal-emoji">${emoji}</span>
          <span class="lusha-signal-title">${escapeHtml(signalTitle)}</span>
          ${signalDate ? `<span class="lusha-signal-date">${signalDate}</span>` : ''}
        </div>
        ${signalDescription ? `<div class="lusha-signal-description">${escapeHtml(signalDescription)}</div>` : ''}
        ${signalUrl ? `<a href="${escapeHtml(signalUrl)}" target="_blank" class="lusha-signal-link">Learn more →</a>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="lusha-signals-section">
      <div class="lusha-signals-header">
        <span class="lusha-signals-icon">🔔</span>
        <span class="lusha-signals-title">Recent Signals</span>
        <span class="lusha-signals-count">${signals.length}</span>
      </div>
      <div class="lusha-signals-list">
        ${signalsHtml}
      </div>
    </div>
  `;
}

window.addEventListener('beforeunload', () => {
  removeSelectionButton();
  removeResultPopup();
});

console.log('[Lusha Everywhere] Content script ready');
