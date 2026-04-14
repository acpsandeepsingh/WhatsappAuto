// js/background.js
let queue = [];
let currentIndex = -1;
let status = 'idle';
let settings = {};

chrome.runtime.onInstalled.addListener(() => {
  console.log("WhatsApp Automation Extension Installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CHECK_CONNECTION") {
    chrome.tabs.query({ url: "*://*.whatsapp.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "PING" }, (res) => {
          if (chrome.runtime.lastError || !res) {
            sendResponse({ success: false, error: "WhatsApp is open but content script is not responding. Please refresh WhatsApp." });
          } else {
            sendResponse({ success: true });
          }
        });
      } else {
        sendResponse({ success: false, error: "WhatsApp Web is not open. Please open web.whatsapp.com" });
      }
    });
    return true;
  }

  if (request.action === "start_queue") {
    queue = request.contacts || [];
    settings = request.settings || {};
    status = 'running';
    currentIndex = 0;
    processNext();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "pause_queue") {
    status = 'paused';
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "resume_queue") {
    status = 'running';
    processNext();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "stop_queue") {
    status = 'stopped';
    queue = [];
    currentIndex = -1;
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "OPEN_CHAT") {
    chrome.tabs.query({ url: "*://*.whatsapp.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "process_row", data: { phone: request.phone, message: "" } }, sendResponse);
      } else {
        sendResponse({ success: false, error: "WhatsApp not open" });
      }
    });
    return true;
  }
});

async function processNext() {
  if (status !== 'running' || currentIndex >= queue.length) {
    if (currentIndex >= queue.length) {
      status = 'idle';
      broadcastStatus();
    }
    return;
  }

  const contact = queue[currentIndex];
  chrome.tabs.query({ url: "*://*.whatsapp.com/*" }, async (tabs) => {
    if (tabs.length === 0) {
      status = 'stopped';
      broadcastStatus("WhatsApp tab closed");
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: "process_row", data: contact, settings }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        broadcastStatus(null, contact.id, 'failed', response?.error || "Unknown error");
      } else {
        broadcastStatus(null, contact.id, 'sent');
      }

      currentIndex++;
      const delay = settings.randomDelay 
        ? Math.floor(Math.random() * (settings.maxDelay - settings.minDelay + 1)) + settings.minDelay 
        : settings.minDelay;
      
      setTimeout(processNext, delay);
    });
  });
}

function broadcastStatus(error = null, contactId = null, lastStatus = null, lastError = null) {
  chrome.runtime.sendMessage({
    action: "status_update",
    status,
    currentIndex,
    error,
    contactId,
    lastStatus,
    lastError
  });
}
