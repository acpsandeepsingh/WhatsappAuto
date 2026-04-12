/**
 * WhatsApp Popup Script
 * Handles UI interactions and triggers automation.
 */

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusText = document.getElementById('status-text');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const scrapeSidebarBtn = document.getElementById('scrape-sidebar-btn');
  const scrapeGroupBtn = document.getElementById('scrape-group-btn');
  const openDashboardBtn = document.getElementById('open-dashboard');
  const waLink = document.getElementById('wa-link');

  // Initial status check
  chrome.runtime.sendMessage({ action: "get_status" }, (response) => {
    if (response) updateUI(response);
  });

  // Start Automation
  startBtn.addEventListener('click', async () => {
    // In a real scenario, we'd get contacts from storage or an input
    // For this implementation, we'll try to get some from the dashboard or storage
    const stored = await chrome.storage.local.get(['pendingContacts', 'automationSettings']);
    const contacts = stored.pendingContacts || [];
    
    if (contacts.length === 0) {
      alert("No contacts found. Please import contacts in the dashboard first.");
      return;
    }

    chrome.runtime.sendMessage({
      action: "start_queue",
      contacts: contacts,
      settings: stored.automationSettings || {}
    }, (response) => {
      if (response.success) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
      }
    });
  });

  // Stop Automation
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "stop_queue" }, (response) => {
      if (response.success) {
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    });
  });

  // Scrape Tools
  scrapeSidebarBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (tabs.length === 0) return alert("WhatsApp tab not found");
    
    chrome.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_GROUPS" }, (response) => {
      if (response && response.success) {
        console.log("Scraped contacts:", response.data);
        alert(`Scraped ${response.data.length} contacts. Check console for details.`);
      }
    });
  });

  // Open Dashboard
  openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  });

  // Open WhatsApp
  waLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "https://web.whatsapp.com" });
  });

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "status_update") {
      updateUI(request);
    }
  });

  function updateUI(data) {
    const { status, currentIndex, total, finished, error } = data;

    statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    statusText.className = `badge badge-${status}`;
    
    const current = currentIndex === -1 ? 0 : currentIndex;
    progressText.textContent = `${current} / ${total}`;
    
    const percentage = total > 0 ? (current / total) * 100 : 0;
    progressFill.style.width = `${percentage}%`;

    if (status === "running") {
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }

    if (finished) {
      alert("Automation finished successfully!");
    }

    if (error) {
      console.error("Automation error:", error);
    }
  }
});
