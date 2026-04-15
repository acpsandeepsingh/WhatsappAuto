console.log("Popup script loaded");

const updateUI = (status, currentIndex = -1) => {
  const statusEl = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleQueue');
  const stopBtn = document.getElementById('stopQueue');
  
  if (statusEl) statusEl.textContent = `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  
  if (toggleBtn) {
    if (status === 'running') {
      toggleBtn.textContent = 'Pause Queue';
      toggleBtn.style.background = '#ff9800';
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
    
    <button id="toggleQueue" style="width: 100%; padding: 10px; cursor: pointer; background: #25d366; color: white; border: none; border-radius: 4px; font-weight: bold; transition: opacity 0.2s;">
      Start Queue
    </button>
    
    <button id="stopQueue" style="width: 100%; padding: 10px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px; font-weight: bold;">
      Stop Queue
    </button>

    <button id="startGroupCampaign" style="width: 100%; padding: 10px; cursor: pointer; background: #34b7f1; color: white; border: none; border-radius: 4px; font-weight: bold;">
      Start Group Campaign
    </button>
    
    <hr style="border: 0; border-top: 1px solid #eee; margin: 5px 0;">
    
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
      chrome.runtime.sendMessage({ action: "pause_queue" });
    } else if (response.status === 'paused') {
      chrome.runtime.sendMessage({ action: "resume_queue" });
    } else {
      // If idle, we need to get contacts from storage
      chrome.storage.local.get(['contacts', 'settings'], (data) => {
        if (data.contacts && data.contacts.length > 0) {
          const pending = data.contacts.filter(c => c.status !== 'sent');
          if (pending.length > 0) {
            chrome.runtime.sendMessage({ 
              action: "start_queue", 
              contacts: pending,
              settings: data.settings 
            });
          } else {
            alert("No pending contacts in queue. Please add contacts in the dashboard.");
          }
        } else {
          alert("Queue is empty. Please add contacts in the dashboard.");
        }
      });
    }
  });
});

document.getElementById('stopQueue').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: "stop_queue" });
});

document.getElementById('startGroupCampaign').addEventListener('click', () => {
  chrome.storage.local.get(['groups', 'selectedGroups', 'settings'], (data) => {
    if (!data.selectedGroups || data.selectedGroups.length === 0) {
      alert("No groups selected. Please select groups in the dashboard.");
      return;
    }
    
    const groupContacts = data.selectedGroups.map((groupId, idx) => {
      const group = data.groups.find(g => g.id === groupId);
      return {
        id: Math.random().toString(36).substr(2, 9),
        sr_no: (idx + 1).toString(),
        name: group?.subject || "Unknown Group",
        phone: group?.id || group?.subject || "",
        message: data.settings?.defaultTemplate || "Hello!",
        attachment: data.settings?.attachment || null, // Include attachment if present
        status: 'pending'
      };
    });

    chrome.runtime.sendMessage({ 
      action: "start_queue", 
      contacts: groupContacts,
      settings: data.settings 
    });
  });
});

document.getElementById('openDashboard').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('index.html'));
  }
});
