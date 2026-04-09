// background.js
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
  if (request.action === "start_queue") {
    queue = request.contacts;
    settings = request.settings;
    currentIndex = 0;
    status = "running";
    processNext();
    sendResponse({ status: "started" });
  } else if (request.action === "pause_queue") {
    status = "paused";
    sendResponse({ status: "paused" });
  } else if (request.action === "resume_queue") {
    status = "running";
    processNext();
    sendResponse({ status: "resumed" });
  } else if (request.action === "stop_queue") {
    status = "stopped";
    currentIndex = -1;
    sendResponse({ status: "stopped" });
  } else if (request.action === "get_status") {
    sendResponse({ status, currentIndex, total: queue.length });
  }
  return true;
});

async function processNext() {
  if (status !== "running" || currentIndex >= queue.length) {
    if (currentIndex >= queue.length) status = "idle";
    updateUI();
    return;
  }

  const contact = queue[currentIndex];
  
  // Find WhatsApp tab
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length === 0) {
    status = "paused";
    updateUI({ error: "WhatsApp Web tab not found. Please keep one open." });
    return;
  }

  const tabId = tabs[0].id;

  try {
    // Ensure the tab is active/focused if needed, but DOM automation usually works in background tabs too
    // However, WhatsApp often throttles background tabs, so focusing might help
    
    const result = await chrome.tabs.sendMessage(tabId, {
      action: "process_row",
      data: contact
    });

    if (result && result.success) {
      currentIndex++;
      updateUI();
      
      const delay = settings.randomDelay 
        ? Math.floor(Math.random() * (settings.maxDelay - settings.minDelay + 1)) + settings.minDelay
        : settings.minDelay;
      
      setTimeout(processNext, delay);
    } else {
      console.error("Row failed:", result?.error);
      // Simple retry logic could go here
      currentIndex++; 
      updateUI({ lastError: result?.error });
      setTimeout(processNext, 2000);
    }
  } catch (e) {
    console.error("Message error:", e);
    status = "paused";
    updateUI({ error: "Communication error with WhatsApp tab. Is it open?" });
  }
}

function updateUI(extra = {}) {
  chrome.runtime.sendMessage({
    action: "status_update",
    status,
    currentIndex,
    total: queue.length,
    ...extra
  }).catch(() => {}); // Ignore if UI is closed
}
