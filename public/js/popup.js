console.log("Popup script loaded");

const updateUI = (status, currentIndex = -1) => {
  const statusEl = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleQueue');
  
  if (statusEl) statusEl.textContent = `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  
  if (toggleBtn) {
    if (status === 'running') {
      toggleBtn.textContent = 'Stop Queue';
      toggleBtn.style.background = '#f44336';
    } else if (status === 'paused') {
      toggleBtn.textContent = 'Resume Queue';
      toggleBtn.style.background = '#25d366';
    } else {
      toggleBtn.textContent = 'Start Queue';
      toggleBtn.style.background = '#25d366';
    }
  }
};

document.getElementById('app').innerHTML = `
  <div style="width: 250px; padding: 16px; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px;">
    <h3 style="margin: 0; color: #075e54;">WhatsApp Automation</h3>
    <div id="status" style="font-size: 14px; color: #666;">Status: Loading...</div>
    
    <button id="toggleQueue" style="width: 100%; padding: 10px; cursor: pointer; background: #25d366; color: white; border: none; border-radius: 4px; font-weight: bold; transition: background 0.2s;">
      Start Queue
    </button>
    
    <div style="height: 5px;"></div>
    
    <button id="openDashboard" style="width: 100%; padding: 10px; cursor: pointer; background: #075e54; color: white; border: none; border-radius: 4px; font-weight: bold;">
      Open Dashboard
    </button>
  </div>
`;

// Initial status check
chrome.runtime.sendMessage({ action: "GET_STATUS" }, (response) => {
  if (response) {
    updateUI(response.status, response.currentIndex);
  }
});

// Listen for status updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "status_update") {
    updateUI(message.status, message.currentIndex);
  }
});

document.getElementById('toggleQueue').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: "GET_STATUS" }, (response) => {
    if (response.status === 'running') {
      // If running, "Stop" action
      chrome.runtime.sendMessage({ action: "stop_queue" });
    } else if (response.status === 'paused') {
      // If paused, "Resume" action
      chrome.runtime.sendMessage({ action: "resume_queue" });
    } else {
      // If idle, "Start" action
      chrome.storage.local.get(['contacts', 'groupContacts', 'settings'], (data) => {
        const individualPending = (data.contacts || []).filter(c => c.status !== 'sent');
        const groupPending = (data.groupContacts || []).filter(c => c.status !== 'sent');
        
        const pending = groupPending.length > 0 ? groupPending : individualPending;

        if (pending.length > 0) {
          chrome.runtime.sendMessage({ 
            action: "start_queue", 
            contacts: pending,
            settings: data.settings 
          });
        } else {
          alert("No pending contacts. Add them in the dashboard.");
        }
      });
    }
  });
});

document.getElementById('openDashboard').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('index.html'));
  }
});
