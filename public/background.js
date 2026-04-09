// background.js
console.log("WhatsApp Automation: Background Script Initialized");

let queue = [];
let currentIndex = -1;
let status = "idle"; // idle, running, paused, stopped
let settings = {
  minDelay: 3000,
  maxDelay: 10000,
  randomDelay: true,
  maxRetries: 3
};

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
  }
  return true;
});

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
      data: contact
    });

    if (result && result.success) {
      console.log(`[BG] Successfully processed row ${currentIndex}`);
      currentIndex++;
      updateUI();
      
      const delay = settings.randomDelay 
        ? Math.floor(Math.random() * (settings.maxDelay - settings.minDelay + 1)) + settings.minDelay
        : settings.minDelay;
      
      console.log(`[BG] Waiting ${delay}ms before next contact`);
      setTimeout(processNext, delay);
    } else {
      console.error(`[BG] Row failed: ${result?.error}`);
      // Move to next anyway or retry? For now, move to next.
      currentIndex++; 
      updateUI({ lastError: result?.error });
      setTimeout(processNext, 2000);
    }
  } catch (e) {
    console.error("[BG] Communication error with WhatsApp tab:", e);
    status = "paused";
    updateUI({ error: "Communication error with WhatsApp tab. Is it open and loaded?" });
  }
}

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
