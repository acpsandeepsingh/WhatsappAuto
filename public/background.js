// background.js
console.log("WhatsApp Automation: Background Script Initialized");

/**
 * State and configuration for the background automation engine.
 */
let queue = [];
let currentIndex = -1;
let status = "idle"; // idle, running, paused, stopped
let settings = {
  minDelay: 3000,
  maxDelay: 10000,
  randomDelay: true,
  maxRetries: 3,
  searchDelay: 3000,
  openChatDelay: 4000,
  pasteDelay: 4000,
  sendDelay: 2000,
  useSmartWait: true
};

/**
 * Main message listener for the background script.
 * Handles queue control (start, pause, resume, stop) and status requests.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`[BG] Received action: ${request.action}`);
  
  if (request.action === "start_queue") {
    queue = request.contacts;
    settings = request.settings || settings;
    currentIndex = 0;
    status = "running";
    console.log(`[BG] Starting queue with ${queue.length} contacts`);
    processNext();
    sendResponse({ status: "started" });
  } else if (request.action === "pause_queue") {
    status = "paused";
    console.log("[BG] Queue paused");
    sendResponse({ status: "paused" });
  } else if (request.action === "resume_queue") {
    status = "running";
    console.log("[BG] Queue resumed");
    processNext();
    sendResponse({ status: "resumed" });
  } else if (request.action === "stop_queue") {
    status = "stopped";
    currentIndex = -1;
    console.log("[BG] Queue stopped");
    sendResponse({ status: "stopped" });
  } else if (request.action === "get_status") {
    sendResponse({ status, currentIndex, total: queue.length });
  } else if (["GET_GROUPS", "FETCH_CONTACTS", "SCRAPE_GROUP", "GET_CHAT_SNAPSHOT", "STOP_CONTACT_FETCH"].includes(request.action)) {
    // Proxy these actions to the WhatsApp tab
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
        if (tabs.length === 0) {
          sendResponse({ success: false, error: "WhatsApp Web tab not found" });
          return;
        }
        const response = await chrome.tabs.sendMessage(tabs[0].id, request);
        sendResponse(response);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // Keep channel open for async response
  }
  return true;
});

/**
 * Replaces placeholders in a message template with contact-specific data.
 * @param {string} template - The message template (e.g., "Hello {{name}}").
 * @param {Object} contact - The contact data object.
 * @returns {string} - The populated message.
 */
function parseTemplate(template, contact) {
  if (!template) return "";
  return template
    .replace(/{{name}}/g, contact.name || "")
    .replace(/{{mobile}}/g, contact.phone || "")
    .replace(/{{sr_no}}/g, contact.sr_no || "");
}

/**
 * The core automation loop. Processes the next contact in the queue.
 * Manages delays, retries, and communication with the WhatsApp Web tab.
 */
async function processNext() {
  if (status !== "running") {
    console.log(`[BG] processNext aborted: status is ${status}`);
    updateUI();
    return;
  }

  if (currentIndex >= queue.length) {
    console.log("[BG] Queue finished");
    status = "idle";
    updateUI();
    return;
  }

  const contact = queue[currentIndex];
  
  // Ensure message is populated from template if missing
  if (!contact.message && contact.message_template) {
    contact.message = parseTemplate(contact.message_template, contact);
  }
  
  console.log(`[BG] Processing contact ${currentIndex + 1}/${queue.length}: ${contact.phone}`);
  
  // Find WhatsApp tab
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length === 0) {
    console.error("[BG] WhatsApp Web tab not found");
    status = "paused";
    updateUI({ error: "WhatsApp Web tab not found. Please keep one open." });
    return;
  }

  const tabId = tabs[0].id;

  try {
    console.log(`[BG] Sending process_row to tab ${tabId}`);
    const result = await chrome.tabs.sendMessage(tabId, {
      action: "process_row",
      data: contact,
      settings: settings
    });

    if (result && result.success) {
      console.log(`[BG] Successfully processed row ${currentIndex}`);
      queue[currentIndex].status = 'sent';
      updateUI({ 
        lastIndex: currentIndex, 
        lastStatus: 'sent',
        contactId: queue[currentIndex].id
      });
      currentIndex++;
      
      const delay = settings.randomDelay 
        ? Math.floor(Math.random() * (settings.maxDelay - settings.minDelay + 1)) + settings.minDelay
        : settings.minDelay;
      
      console.log(`[BG] Waiting ${delay}ms before next contact`);
      setTimeout(processNext, delay);
    } else {
      const errorMsg = result?.error || "Unknown error";
      console.error(`[BG] Row failed: ${errorMsg}`);
      queue[currentIndex].status = 'failed';
      queue[currentIndex].error = errorMsg;
      
      updateUI({ 
        lastIndex: currentIndex, 
        lastStatus: 'failed', 
        lastError: errorMsg,
        contactId: queue[currentIndex].id
      });
      
      currentIndex++; 
      setTimeout(processNext, 2000);
    }
  } catch (e) {
    console.error("[BG] Communication error with WhatsApp tab:", e);
    status = "paused";
    updateUI({ error: "Communication error with WhatsApp tab. Is it open and loaded?" });
  }
}

/**
 * Sends a status update to the dashboard/popup UI.
 * @param {Object} extra - Additional data to include in the update (e.g., error messages).
 */
function updateUI(extra = {}) {
  chrome.runtime.sendMessage({
    action: "status_update",
    status,
    currentIndex,
    total: queue.length,
    ...extra
  }).catch(() => {
    // This error is expected if the popup/dashboard is closed
  });
}
