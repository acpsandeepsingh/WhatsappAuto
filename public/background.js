/**
 * WhatsApp Background Script
 * Manages the automation queue and communication.
 */

let state = {
  queue: [],
  currentIndex: -1,
  status: "idle", // idle, running, paused, stopped
  settings: {
    minDelay: 3000,
    maxDelay: 8000,
    randomDelay: true
  }
};

/**
 * The "fe77" core controller logic.
 */
const fe77 = {
  async start(contacts, settings) {
    state.queue = contacts;
    state.settings = { ...state.settings, ...settings };
    state.currentIndex = 0;
    state.status = "running";
    this.processNext();
  },

  async pause() {
    state.status = "paused";
    this.updateUI();
  },

  async resume() {
    if (state.status === "paused") {
      state.status = "running";
      this.processNext();
    }
  },

  async stop() {
    state.status = "stopped";
    state.currentIndex = -1;
    this.updateUI();
  },

  async processNext() {
    if (state.status !== "running") return;
    if (state.currentIndex >= state.queue.length) {
      state.status = "idle";
      this.updateUI({ finished: true });
      return;
    }

    const contact = state.queue[state.currentIndex];
    console.log(`[BG] Processing ${state.currentIndex + 1}/${state.queue.length}: ${contact.phone}`);

    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (tabs.length === 0) {
      state.status = "paused";
      this.updateUI({ error: "WhatsApp tab not found" });
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        action: "SEND_MESSAGE",
        data: contact
      });

      if (response && response.success) {
        const contactId = contact.id;
        state.currentIndex++;
        this.updateUI({ contactId, lastStatus: 'sent' });
        
        const delay = state.settings.randomDelay 
          ? Math.floor(Math.random() * (state.settings.maxDelay - state.settings.minDelay + 1)) + state.settings.minDelay
          : state.settings.minDelay;
        
        setTimeout(() => this.processNext(), delay);
      } else {
        const contactId = contact.id;
        const errorMsg = response?.error || "Unknown error";
        console.error(`[BG] Failed for ${contact.phone}:`, errorMsg);
        state.currentIndex++; 
        this.updateUI({ contactId, lastStatus: 'failed', lastError: errorMsg });
        setTimeout(() => this.processNext(), 2000);
      }
    } catch (error) {
      console.error("[BG] Communication error:", error);
      state.status = "paused";
      this.updateUI({ error: "Communication error with WhatsApp tab" });
    }
  },

  updateUI(extra = {}) {
    chrome.runtime.sendMessage({
      action: "status_update",
      status: state.status,
      currentIndex: state.currentIndex,
      total: state.queue.length,
      ...extra
    }).catch(() => {}); // Ignore if popup is closed
  }
};

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "start_queue":
      fe77.start(request.contacts, request.settings);
      sendResponse({ success: true });
      break;
    case "pause_queue":
      fe77.pause();
      sendResponse({ success: true });
      break;
    case "resume_queue":
      fe77.resume();
      sendResponse({ success: true });
      break;
    case "stop_queue":
      fe77.stop();
      sendResponse({ success: true });
      break;
    case "get_status":
      sendResponse({
        status: state.status,
        currentIndex: state.currentIndex,
        total: state.queue.length
      });
      break;
    case "OPEN_CHAT":
      (async () => {
        try {
          const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
          if (tabs.length === 0) {
            sendResponse({ success: false, error: "WhatsApp tab not found" });
            return;
          }
          
          const tabId = tabs[0].id;

          // Check if already injected to avoid re-injecting the large testinject.js
          const checkInjected = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: () => !!window.BULK_WPP
          }).catch(() => [{ result: false }]);
          
          if (!checkInjected[0]?.result) {
            console.log("[BG] Injecting testinject.js...");
            await chrome.scripting.executeScript({
              target: { tabId },
              world: "MAIN",
              files: ["testinject.js"]
            });
          }

          // Always ensure inject.js bridge is there (it has its own guard)
          await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            files: ["inject.js"]
          });

          // Send message to the content script to relay to the MAIN world
          chrome.tabs.sendMessage(tabId, {
            action: "OPEN_CHAT_INTERNAL",
            phone: request.phone
          }, (response) => {
            sendResponse(response);
          });
        } catch (error) {
          console.error("[BG] OPEN_CHAT error:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Keep channel open for async response
  }
  return true;
});
