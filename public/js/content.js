// js/content.js
(function() {
    // Inject the main world script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/inject.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log("WhatsApp Automation: Injector script executed");
})();

console.log("WhatsApp Automation Loaded");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SELECTORS = {
  searchBox: 'input[data-tab="3"], #_r_b_, div[contenteditable="true"][data-tab="3"]',
  chatList: '#pane-side [role="grid"]',
  chatRow: '[role="row"]',
  messageBox: 'footer div[contenteditable="true"][data-tab="10"], div.lexical-rich-text-input div[contenteditable="true"]',
  captionBox: 'div.x1hx0egp.x6ikm8r.x1odjw0f[role="textbox"], [label="Type a message"], div[contenteditable="true"][data-placeholder="Add a caption"], div[contenteditable="true"].lexical-rich-text-input, div[aria-label="Add a caption"], div[data-tab="10"][contenteditable="true"]',
  sendBtn: 'span[data-icon="send"], span[data-icon="wds-ic-send-filled"], button[aria-label="Send"], div[role="button"] span[data-icon="send"], button span[data-icon="send"], [data-testid="send"], [data-icon="send-light"]',
  attachBtn: 'button[data-tab="10"][aria-label="Attach"]',
  fileInputs: 'input[type="file"]',
  newChatBtn: 'button[aria-label="New chat"], span[data-icon="new-chat-outline"]',
  newChatSearch: 'div[role="textbox"][aria-label="Search name or number"], input[aria-label="Search name or number"]',
  chatHeaderTitle: 'div[role="button"][data-tab="6"] span[dir="auto"]',
  statusIcons: {
    sent: 'span[data-icon="msg-check"][aria-label*="Sent"]',
    delivered: 'span[data-icon="msg-dblcheck"][aria-label*="Delivered"]',
    read: 'span[data-icon="msg-dblcheck"][aria-label*="Read"]'
  },
  lastMessage: 'div.message-out:last-child, [data-testid="msg-container"]:last-child'
};

let automationSettings = {
  searchDelay: 1500,
  openChatDelay: 2000,
  pasteDelay: 2000,
  sendDelay: 1000,
  useSmartWait: true
};

async function callInjected(type, data = {}) {
  return new Promise((resolve, reject) => {
    const requestId = Date.now() + Math.random();
    const listener = (event) => {
      if (event.source !== window || !event.data || event.data.requestId !== requestId) return;
      if (event.data.type === `${type}_RESULT`) {
        window.removeEventListener("message", listener);
        if (event.data.success) resolve(event.data);
        else reject(new Error(event.data.error || "Action failed"));
      }
    };
    window.addEventListener("message", listener);
    window.postMessage({ type, requestId, ...data }, "*");
    
    // Timeout after 30 seconds
    setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("Request timed out"));
    }, 30000);
  });
}

async function waitForElement(selector, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el && el.isConnected) return el;
    await sleep(500);
  }
  return null;
}

async function smartWait(selector, fallbackDelay) {
  if (automationSettings.useSmartWait && selector) {
    const el = await waitForElement(selector, fallbackDelay);
    if (el) {
      await sleep(500);
      return el;
    }
  }
  await sleep(fallbackDelay);
  return null;
}

async function searchAndOpenChat(phone, message = "", name = "") {
  console.log(`[WhatsApp Automation] Opening chat for: ${phone} (${name})`);
  
  const isGroup = phone.includes('@g.us');
  
  if (isGroup) {
    // Group logic: Try direct open, then search
    if (automationSettings.useDirectOpen) {
      try {
        console.log("[WhatsApp Automation] Attempting direct group open...");
        const res = await callInjected("WA_OPEN_CHAT", { phone });
        if (res.useFallback) throw new Error("API fallback requested");
        await smartWait(SELECTORS.messageBox, automationSettings.openChatDelay);
      } catch (err) {
        console.warn("[WhatsApp Automation] Direct group open failed, falling back to search:", err.message);
        await manualSearch(phone, name, true);
      }
    } else {
      await manualSearch(phone, name, true);
    }

    // Verify name for groups
    if (name) {
      await sleep(1000);
      const headerTitle = document.querySelector(SELECTORS.chatHeaderTitle);
      if (headerTitle) {
        const openedName = headerTitle.innerText.trim();
        console.log(`[WhatsApp Automation] Verifying opened group: "${openedName}" vs expected: "${name}"`);
        if (openedName.toLowerCase() !== name.toLowerCase()) {
          console.warn(`[WhatsApp Automation] Group name mismatch! Opened: "${openedName}", Expected: "${name}"`);
        }
      }
    }
  } else {
    // Contact logic: Use api.whatsapp.com/send (the link method) as requested
    const number = phone.replace(/\D/g, "");
    const text = encodeURIComponent(message);
    
    console.log(`[WhatsApp Automation] Navigating to chat for ${number} via api.whatsapp.com`);
    const a = document.createElement("a");
    a.href = `https://api.whatsapp.com/send?phone=${number}&text=${text}`;
    a.target = "_self";
    document.body.appendChild(a);
    a.click();
    await sleep(1000);
    if (a.parentNode) a.parentNode.removeChild(a);
    
    // No name verification for contacts as requested
  }
  
  const messageBox = await waitForElement(SELECTORS.messageBox, 35000);
  if (!messageBox) {
    throw new Error("Message box not found. Make sure the chat is open and loaded.");
  }

  return true;
}

async function manualSearch(phone, name, isGroup) {
  const searchBox = await waitForElement(SELECTORS.searchBox);
  if (!searchBox) return;

  searchBox.click();
  searchBox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  
  const searchTerm = isGroup ? (name || phone) : phone;
  document.execCommand('insertText', false, searchTerm);
  searchBox.dispatchEvent(new Event('input', { bubbles: true }));
  
  await sleep(automationSettings.searchDelay);
  
  const chatList = document.querySelector(SELECTORS.chatList);
  if (chatList) {
    const rows = chatList.querySelectorAll(SELECTORS.chatRow);
    let targetRow = null;
    
    if (isGroup) {
      for (const row of rows) {
        const titleEl = row.querySelector('span[title]');
        const title = titleEl ? titleEl.getAttribute('title') : "";
        if (title.toLowerCase() === searchTerm.toLowerCase()) {
          targetRow = row;
          break;
        }
      }
    }
    
    if (!targetRow && rows.length > 0) targetRow = rows[0];

    if (targetRow) {
      const target = targetRow.querySelector('div[role="gridcell"]._ak8o') || targetRow.querySelector('div[role="button"]') || targetRow;
      const clickEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
      target.dispatchEvent(clickEvent);
      await sleep(100);
      target.click();
      const upEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
      target.dispatchEvent(upEvent);
    }
  }
}

async function injectMessage(text) {
  if (!text) return true;
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message box not found");

  messageBox.click();
  messageBox.focus();
  
  // Check if text is already there (e.g. from api.whatsapp.com/send?text=...)
  // We check if the box is effectively empty or just has placeholder
  const currentText = (messageBox.innerText || messageBox.textContent || "").trim();
  const placeholder = messageBox.getAttribute('data-placeholder') || "";
  const isPlaceholder = currentText === placeholder;
  
  console.log(`[WhatsApp Automation] Current text in box: "${currentText}"`);
  
  if (currentText.length < 2 || isPlaceholder) { 
    console.log("[WhatsApp Automation] Message box empty or placeholder, typing message...");
    // Clear first to be safe
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await sleep(1000);
    
    document.execCommand('insertText', false, text);
    messageBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(automationSettings.pasteDelay);
  } else {
    console.log("[WhatsApp Automation] Message box already has text, skipping typing");
  }

  // Try clicking the send button first (more reliable than Enter key)
  let sendBtn = null;
  for (let i = 0; i < 15; i++) { // Increase attempts for contact mode
    sendBtn = document.querySelector(SELECTORS.sendBtn);
    if (sendBtn) {
      // If we found a span/icon, try to find the clickable parent button
      const parentButton = sendBtn.closest('button') || sendBtn.closest('[role="button"]');
      if (parentButton) sendBtn = parentButton;
      break;
    }
    await sleep(500);
  }

  if (sendBtn) {
    console.log("[WhatsApp Automation] Clicking send button");
    sendBtn.click();
    
    // Sometimes a single click isn't enough or needs a small delay
    await sleep(500);
    if (document.querySelector(SELECTORS.sendBtn)) {
       // If button still exists, try one more time or use Enter
       sendBtn.click();
    }
  } else {
    console.log("[WhatsApp Automation] Send button not found, trying Enter key");
    const eventOptions = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    messageBox.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    messageBox.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    messageBox.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  }
  
  await sleep(automationSettings.sendDelay);
  
  // Verification step: Wait for the message to actually leave the box and show a status icon
  const sent = await verifyMessageSent();
  return sent;
}

async function verifyMessageSent() {
  console.log("[WhatsApp Automation] Verifying message status...");
  // Wait up to 15 seconds for a status icon to appear on the last outgoing message
  // We use a longer timeout because "Delivered" or "Read" might take a moment
  let lastStatus = "Sent"; 
  
  for (let i = 0; i < 30; i++) {
    const lastMsg = document.querySelector('div.message-out:last-child, [data-testid="msg-container"]:last-child');
    if (lastMsg) {
      const statusIcon = lastMsg.querySelector('span[data-icon="msg-check"], span[data-icon="msg-dblcheck"]');
      if (statusIcon) {
        const label = statusIcon.getAttribute('aria-label') || "";
        if (label.includes("Read")) return "Read";
        if (label.includes("Delivered")) return "Delivered";
        if (label.includes("Sent")) lastStatus = "Sent";
      }
    }
    await sleep(500);
    // If we already saw "Sent", we can wait a bit more to see if it turns to "Delivered"
    // but we don't want to block the whole queue for too long.
    if (i > 10 && lastStatus === "Sent") break; 
  }
  return lastStatus;
}

async function handleAttachment(attachment, caption = "") {
  if (!attachment || !attachment.dataUrl) return true;
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message box not found");

  const res = await fetch(attachment.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], attachment.name || "attachment", { type: blob.type });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  const pasteEvent = new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true });
  messageBox.dispatchEvent(pasteEvent);

  await smartWait(SELECTORS.captionBox, automationSettings.pasteDelay);
  if (caption) {
    const cb = document.querySelector(SELECTORS.captionBox);
    if (cb) {
      cb.focus();
      document.execCommand('insertText', false, caption);
      cb.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Wait for attachment to be fully loaded (indicated by the presence of ic-close title in SVG)
  console.log("[WhatsApp Automation] Waiting for attachment to load...");
  let loaded = false;
  for (let i = 0; i < 60; i++) { // Wait up to 30 seconds for large files
    const titles = document.querySelectorAll('title');
    for (const t of titles) {
      if (t.textContent === 'ic-close') {
        loaded = true;
        break;
      }
    }
    if (loaded) break;
    await sleep(500);
  }
  
  if (!loaded) {
    console.warn("[WhatsApp Automation] Attachment load indicator (ic-close) not found, but trying to send anyway.");
  } else {
    console.log("[WhatsApp Automation] Attachment loaded successfully.");
  }

  // Use more robust send button detection same as injectMessage
  let sendBtn = null;
  for (let i = 0; i < 15; i++) {
    sendBtn = document.querySelector(SELECTORS.sendBtn);
    if (sendBtn) {
      const parentButton = sendBtn.closest('button') || sendBtn.closest('[role="button"]');
      if (parentButton) sendBtn = parentButton;
      break;
    }
    await sleep(500);
  }

  if (sendBtn) {
    sendBtn.click();
    await sleep(automationSettings.sendDelay);
    const status = await verifyMessageSent();
    return status;
  }
  throw new Error("Send button not found in preview");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING") {
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "get_groups") {
    callInjected("WA_GET_GROUPS")
      .then(res => sendResponse({ success: true, groups: res.data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "scrape_group") {
    callInjected("WA_SCRAPE_GROUP", { phone: request.groupId || request.groupName })
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "fetch_contacts") {
    callInjected("WA_GET_CONTACTS", { filter: request.filter })
      .then(res => sendResponse(res))
      .catch(err => {
        sendResponse({ success: false, error: "Fast fetch not available. Try UI scrape." });
      });
    return true;
  }

  if (request.action === "process_row") {
    (async () => {
      try {
        const { phone, message, attachment, name } = request.data;
        if (request.settings) automationSettings = { ...automationSettings, ...request.settings };
        await searchAndOpenChat(phone, message, name);
        
        // If we only wanted to open the chat (no message and not sendImmediately), we stop here
        if (!message && !attachment && !request.settings?.sendImmediately) {
          sendResponse({ success: true });
          return;
        }

        let status = "sent";
        if (attachment) {
          await handleAttachment(attachment, message);
          status = await verifyMessageSent();
        } else if (message) {
          await injectMessage(message);
          status = await verifyMessageSent();
        }
        sendResponse({ success: true, status: status.toLowerCase() });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
