document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('status-text');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');

  console.log("[Popup] DOM loaded, initializing...");

  const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

  if (!isExtension) {
    console.warn("[Popup] Not running as an extension. Buttons will be disabled.");
    if (statusText) statusText.textContent = "Offline (Not Extension)";
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
  }

  function updateUI() {
    if (!isExtension) return;

    chrome.runtime.sendMessage({ action: "get_status" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Popup] Background script not responding:", chrome.runtime.lastError.message);
        if (statusText) statusText.textContent = "Error: BG Offline";
        return;
      }
      
      if (!response) {
        console.warn("[Popup] No response from background script");
        return;
      }

      const { status, currentIndex, total } = response;
      console.log(`[Popup] Status: ${status}, Progress: ${currentIndex}/${total}`);
      
      // Update Status Badge
      if (statusText) {
        statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusText.className = `badge badge-${status}`;
      }

      // Update Progress
      const current = currentIndex === -1 ? 0 : currentIndex;
      if (progressText) progressText.textContent = `${current} / ${total}`;
      
      const percent = total > 0 ? (current / total) * 100 : 0;
      if (progressFill) progressFill.style.width = `${percent}%`;

      // Update Buttons
      if (status === 'running') {
        if (startBtn) {
          startBtn.disabled = true;
          startBtn.textContent = 'Running...';
        }
        if (stopBtn) stopBtn.disabled = false;
      } else if (status === 'paused') {
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.textContent = 'Resume';
        }
        if (stopBtn) stopBtn.disabled = false;
      } else {
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.textContent = 'Start';
        }
        if (stopBtn) stopBtn.disabled = true;
      }
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!isExtension) return;
      console.log("[Popup] Start/Resume clicked");
      
      chrome.runtime.sendMessage({ action: "get_status" }, (statusRes) => {
        if (statusRes && statusRes.status === 'paused') {
          console.log("[Popup] Sending resume_queue");
          chrome.runtime.sendMessage({ action: "resume_queue" }, () => updateUI());
        } else {
          console.log("[Popup] Starting new queue from storage");
          chrome.storage.local.get(['contacts', 'settings'], (data) => {
            if (data.contacts && data.contacts.length > 0) {
              console.log(`[Popup] Sending ${data.contacts.length} contacts to background`);
              chrome.runtime.sendMessage({ 
                action: "start_queue", 
                contacts: data.contacts, 
                settings: data.settings 
              }, (res) => {
                console.log("[Popup] Start response:", res);
                updateUI();
              });
            } else {
              alert("Please add contacts in the dashboard first!");
              chrome.runtime.openOptionsPage();
            }
          });
        }
      });
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (!isExtension) return;
      console.log("[Popup] Stop clicked");
      chrome.runtime.sendMessage({ action: "stop_queue" }, (res) => {
        console.log("[Popup] Stop response:", res);
        updateUI();
      });
    });
  }

  const openDashboardBtn = document.getElementById('open-dashboard');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      if (isExtension) {
        chrome.runtime.openOptionsPage();
      } else {
        window.location.href = 'index.html';
      }
    });
  }

  const waLink = document.getElementById('wa-link');
  if (waLink) {
    waLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.open('https://web.whatsapp.com', '_blank');
    });
  }

  // Initial check and start polling
  if (isExtension) {
    updateUI();
    setInterval(updateUI, 1000);
  }
});
