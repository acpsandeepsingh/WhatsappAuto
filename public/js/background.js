// js/background.js
let queue = [];
let currentIndex = -1;
let status = 'idle';
let settings = {};

chrome.runtime.onInstalled.addListener(() => {
  console.log("WhatsApp Automation Installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CHECK_CONNECTION" || request.action === "GET_GROUPS" || request.action === "FETCH_CONTACTS" || request.action === "SCRAPE_GROUP") {
    chrome.tabs.query({ url: "*://*.whatsapp.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        const targetTab = tabs[0];
        chrome.tabs.sendMessage(targetTab.id, { action: "PING" }, (res) => {
          if (chrome.runtime.lastError || !res) {
            // Tab exists but content script not responding, refresh it
            chrome.tabs.reload(targetTab.id, {}, () => {
              sendResponse({ success: false, error: "WhatsApp tab was stale and is being refreshed. Please try again in a few seconds." });
            });
          } else {
            // If it's just a connection check, we're done
            if (request.action === "CHECK_CONNECTION") {
              sendResponse({ success: true });
              return;
            }

            // Otherwise proxy the specific action
            let contentAction = request.action;
            if (request.action === "GET_GROUPS") contentAction = "get_groups";
            if (request.action === "SCRAPE_GROUP") contentAction = "scrape_group";
            if (request.action === "FETCH_CONTACTS") contentAction = "fetch_contacts";

            chrome.tabs.sendMessage(targetTab.id, { ...request, action: contentAction }, (res) => {
              if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: "Content script not responding" });
              } else {
                sendResponse(res);
              }
            });
          }
        });
      } else {
        // No WhatsApp tab found, open a new one
        chrome.tabs.create({ url: "https://web.whatsapp.com" }, (newTab) => {
          sendResponse({ success: false, error: "WhatsApp Web was not open. A new tab has been opened for you. Please log in and try again." });
        });
      }
    });
    return true;
  }

  if (request.action === "start_queue") {
    queue = (request.contacts || []).map(c => {
      // Ensure message is populated from template if missing
      if (!c.message && c.message_template) {
        let msg = c.message_template;
        msg = msg.replace(/{{name}}/g, c.name || "");
        msg = msg.replace(/{{phone}}/g, c.phone || "");
        msg = msg.replace(/{{sr_no}}/g, c.sr_no || "");
        return { ...c, message: msg };
      }
      return c;
    });
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

  if (request.action === "GET_STATUS") {
    sendResponse({ status, currentIndex });
    return true;
  }

  if (request.action === "OPEN_CHAT") {
    chrome.tabs.query({ url: "*://*.whatsapp.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: "process_row", 
          data: { 
            phone: request.phone, 
            message: request.message || "",
            name: request.name || ""
          },
          settings: {
            ...settings,
            sendImmediately: request.sendImmediately || false
          }
        }, sendResponse);
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
        broadcastStatus(null, contact.id, response.status || 'sent');
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
