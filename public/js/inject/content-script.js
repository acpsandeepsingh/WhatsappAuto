// content-script.js
console.log("WhatsApp Automation Loaded");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SELECTORS = {
  searchBox: 'input[data-tab="3"], #_r_b_',
  chatList: '#pane-side [role="grid"]',
  chatRow: '[role="row"]',
  messageBox: 'footer div[contenteditable="true"][data-tab="10"], div.lexical-rich-text-input div[contenteditable="true"]',
  captionBox: 'div.x1hx0egp.x6ikm8r.x1odjw0f[role="textbox"], [label="Type a message"], div[contenteditable="true"][data-placeholder="Add a caption"], div[contenteditable="true"].lexical-rich-text-input, div[aria-label="Add a caption"], div[data-tab="10"][contenteditable="true"]',
  sendBtn: 'span[data-icon="send"], span[data-icon="wds-ic-send-filled"], button[aria-label="Send"], div[role="button"] span[data-icon="send"]',
  attachBtn: 'button[data-tab="10"][aria-label="Attach"]',
  fileInputs: 'input[type="file"]',
  newChatBtn: 'button[aria-label="New chat"], span[data-icon="new-chat-outline"]',
  newChatSearch: 'div[role="textbox"][aria-label="Search name or number"], input[aria-label="Search name or number"]'
};

let automationSettings = {
  searchDelay: 3000,
  openChatDelay: 4000,
  pasteDelay: 4000,
  sendDelay: 2000,
  useSmartWait: true
};

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

async function searchAndOpenChat(phone, message = "") {
  console.log(`[WhatsApp Automation] Opening chat for: ${phone}`);
  
  if (phone.includes('@g.us')) {
    // It's a group, use the internal API via the injected script
    window.postMessage({ type: "WA_OPEN_CHAT", phone: phone, requestId: Date.now() }, "*");
    
    // Wait for the chat to actually load
    const messageBox = await waitForElement(SELECTORS.messageBox, 20000);
    if (!messageBox) {
      throw new Error("Group message box not found. Make sure you are a member of the group.");
    }
    return true;
  }

  // Use the requested logic to open chat via api.whatsapp.com without full redirect
  const number = phone.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  
  const a = document.createElement("a");
  a.href = `https://api.whatsapp.com/send?phone=${number}&text=${text}`;
  a.target = "_self";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Wait for the chat to actually load
  const messageBox = await waitForElement(SELECTORS.messageBox, 20000);
  if (!messageBox) {
    throw new Error("Message box not found after opening chat. Please ensure you are logged in to WhatsApp Web.");
  }
  return true;
}

async function injectMessage(text) {
  if (!text) return true;
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message box not found");

  messageBox.click();
  messageBox.focus();
  
  // Check if text is already there (e.g. from api.whatsapp.com/send?text=...)
  const currentText = messageBox.innerText || messageBox.textContent || "";
  if (!currentText.includes(text.substring(0, 10))) { 
    // Only type if it's not already there or looks different
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, text);
    messageBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1000);
  }

  // Try clicking the send button first (more reliable than Enter key)
  const sendBtn = await waitForElement(SELECTORS.sendBtn, 5000);
  if (sendBtn) {
    console.log("[WhatsApp Automation] Clicking send button");
    sendBtn.click();
  } else {
    console.log("[WhatsApp Automation] Send button not found, trying Enter key");
    const eventOptions = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    messageBox.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
  }
  
  await sleep(automationSettings.sendDelay);
  return true;
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
    }
  }

  const sendBtn = await waitForElement('button[aria-label="Send"], span[data-icon="send"]');
  if (sendBtn) {
    sendBtn.click();
    await sleep(automationSettings.sendDelay);
    return true;
  }
  throw new Error("Send button not found in preview");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING") {
    sendResponse({ success: true });
    return true;
  }
  if (request.action === "process_row") {
    (async () => {
      try {
        const { phone, message, attachment } = request.data;
        if (request.settings) automationSettings = { ...automationSettings, ...request.settings };
        await searchAndOpenChat(phone, message);
        if (attachment) await handleAttachment(attachment, message);
        else await injectMessage(message);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
