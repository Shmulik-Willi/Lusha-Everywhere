// popup.js - Manage API Key in extension settings

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  const viewStatsBtn = document.getElementById('viewStatsBtn');
  const statsContainer = document.getElementById('statsContainer');
  const closeStatsBtn = document.getElementById('closeStatsBtn');
  const statsContent = document.getElementById('statsContent');
  // Store real key to separate display from value
  let realApiKey = '';

  // Load existing API Key
  const { lushaApiKey } = await chrome.storage.sync.get('lushaApiKey');

  if (lushaApiKey) {
    realApiKey = lushaApiKey;
    apiKeyInput.value = maskApiKey(lushaApiKey);
    showStatus('API Key saved and ready to use', 'success');
  } else {
    // No API key configured yet
    showStatus('Please enter your Lusha API Key', 'info');
  }

  // Handle input changes - if user edits, he is typing a NEW key (or clearing)
  apiKeyInput.addEventListener('input', (e) => {
    // If user deleted everything, clear real key
    if (!e.target.value) {
      realApiKey = '';
      return;
    }

    // If user is typing, we assume they are replacing the key.
    // However, if the input value still matches a masked pattern of our current key, we should be careful.
    // Simplifying assumption: If they edit, they see what they type.
    // If they want to keep the old key, they shouldn't touch it.
    // But if they type 'a', the value becomes 'abcd***a' or just 'a'?
    // Standard behavior: text input just changes value.
    // We treat the current input value as the new key, UNLESS it is exactly the masked string of the old key.

    // Actually, simpler approach: Update `realApiKey` to match input value, unless input value IS the mask.
    // But if input value IS the mask, they haven't changed anything.
    // If they change one char, it is no longer the mask.
    realApiKey = e.target.value;
  });

  // Save API Key
  saveBtn.addEventListener('click', async () => {
    // If input value is somehow exactly the mask logic, we use the stored real key.
    // Otherwise we use what's in the input (which updated realApiKey).

    // Special check: If the input value looks like our mask for the current real key, 
    // it means user didn't change it, so we save existing realApiKey.
    const currentInputValue = apiKeyInput.value.trim();
    const maskedReal = maskApiKey(realApiKey);

    let keyToSave = currentInputValue;
    if (currentInputValue === maskedReal) {
      keyToSave = realApiKey;
    }

    if (!keyToSave) {
      showStatus('Please enter a valid API Key', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ lushaApiKey: keyToSave });
      // Update local state to match saved
      realApiKey = keyToSave;
      apiKeyInput.value = maskApiKey(keyToSave);

      showStatus('API Key saved successfully!', 'success');

      // Notify all open tabs that API Key was updated
      try {
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'API_KEY_UPDATED',
            apiKey: keyToSave
          }).catch(() => {
            // Tab might not have content script loaded - ignore
          });
        });
      } catch (tabError) {
        // Ignore tab messaging errors
      }
    } catch (error) {
      showStatus('Error saving API Key', 'error');
      console.error('Error saving API key:', error);
    }
  });

  function maskApiKey(key) {
    if (!key || key.length <= 4) return key;
    return key.substring(0, 4) + '*'.repeat(key.length - 4);
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.classList.remove('hidden');
  }

  // View Stats Button Handler
  viewStatsBtn.addEventListener('click', async () => {
    if (!realApiKey) {
      showStatus('Please save your API Key first', 'error');
      return;
    }

    // Show stats container and loading state
    statsContainer.classList.remove('hidden');
    statsContent.innerHTML = '<div class="stats-loading">Loading stats...</div>';

    try {
      console.log('Fetching stats with API key:', realApiKey.substring(0, 8) + '...');

      const response = await fetch('https://api.lusha.com/account/usage', {
        method: 'GET',
        headers: {
          'api_key': realApiKey
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response body:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Raw API response:', JSON.stringify(data, null, 2));
      displayStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      statsContent.innerHTML = `
        <div class="stats-error">
          ❌ Failed to load stats: ${error.message}
        </div>
      `;
    }
  });

  // Close Stats Button Handler
  closeStatsBtn.addEventListener('click', () => {
    statsContainer.classList.add('hidden');
  });

  // Display Stats Function
  function displayStats(data) {
    console.log('Stats data received:', JSON.stringify(data, null, 2));

    const usage = data.usage || {};
    console.log('Usage object:', JSON.stringify(usage, null, 2));

    // Try both possible structures: credits or bulkCredits
    const credits = usage.credits || usage.bulkCredits || {};
    console.log('Credits object:', JSON.stringify(credits, null, 2));

    // Extract credit information
    const totalCredits = credits.total || credits.limit || 0;
    const usedCredits = credits.used || credits.consumed || 0;
    const remainingCredits = credits.remaining || (totalCredits - usedCredits);
    const percentageUsed = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;

    console.log('Extracted values:', { totalCredits, usedCredits, remainingCredits, percentageUsed });

    statsContent.innerHTML = `
      <div class="stats-modern">
        <div class="balance-header">
          <span class="balance-icon">⚙️</span>
          <span class="balance-label">Balance</span>
          <span class="balance-value">${remainingCredits.toLocaleString()}</span>
        </div>

        <div class="credits-section">
          <h4 class="section-title">Account credits</h4>
          <div class="usage-text">${usedCredits.toLocaleString()} used of ${totalCredits.toLocaleString()}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentageUsed}%"></div>
          </div>
        </div>
      </div>
    `;
  }
});
