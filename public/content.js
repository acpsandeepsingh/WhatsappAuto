// content.js
console.log("WhatsApp Automation: Content Script Loaded");

/**
 * Utility to pause execution for a specified duration.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * DOM Selectors for various WhatsApp Web elements.
 * These are used to interact with the UI during automation.
 */
const SELECTORS = {
  // Search box is an input with data-tab="3"
  searchBox: 'input[data-tab="3"], #_r_b_',
  // Chat list container
  chatList: '#pane-side [role="grid"]',
  // Individual chat row
  chatRow: '[role="row"]',
  // Message input box - broadened to handle Lexical variations
  messageBox: 'footer div[contenteditable="true"][data-tab="10"], div.lexical-rich-text-input div[contenteditable="true"]',
  // Caption box in attachment preview
  captionBox: 'div.x1hx0egp.x6ikm8r.x1odjw0f[role="textbox"], [label="Type a message"], div[contenteditable="true"][data-placeholder="Add a caption"], div[contenteditable="true"].lexical-rich-text-input, div[aria-label="Add a caption"], div[data-tab="10"][contenteditable="true"]',
  // Send button (appears after typing or in attachment preview)
  sendBtn: 'span[data-icon="send"], span[data-icon="wds-ic-send-filled"], button[aria-label="Send"], div[role="button"] span[data-icon="send"]',
  // Attach button (the plus icon)
  attachBtn: 'button[data-tab="10"][aria-label="Attach"]',
  // File inputs (global search)
  fileInputs: 'input[type="file"]',
  // New Chat
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

/**
 * Waits for an element to appear in the DOM within a timeout.
 * @param {string} selector - CSS selector of the element.
 * @param {number} timeout - Maximum time to wait in milliseconds.
 * @returns {Promise<Element|null>} - The found element or null if timeout.
 */
async function waitForElement(selector, timeout = 15000) {
  console.log(`[WA Auto] Waiting for element: ${selector}`);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el && el.isConnected) {
      console.log(`[WA Auto] Found element: ${selector}`);
      return el;
    }
    await sleep(500);
  }
  console.error(`[WA Auto] Timeout waiting for element: ${selector}`);
  return null;
}

/**
 * Implements "Smart Wait" logic: waits for an element if enabled, otherwise uses a fixed delay.
 * This helps speed up automation by proceeding as soon as the UI is ready.
 * @param {string} selector - CSS selector to wait for.
 * @param {number} fallbackDelay - Fixed delay to use if Smart Wait is disabled or element not found.
 * @returns {Promise<Element|null>}
 */
async function smartWait(selector, fallbackDelay) {
  if (automationSettings.useSmartWait && selector) {
    console.log(`[WA Auto] Smart Wait: Waiting for ${selector}...`);
    const el = await waitForElement(selector, fallbackDelay);
    if (el) {
      await sleep(500); // Small buffer after element appears
      return el;
    }
  }
  console.log(`[WA Auto] Fixed Delay: Waiting ${fallbackDelay}ms`);
  await sleep(fallbackDelay);
  return null;
}

/**
 * Searches for a phone number and opens the corresponding chat.
 * Includes fallback to "New Chat" if the contact isn't in the recent list.
 * @param {string} phone - The phone number to search for.
 * @throws {Error} - If the contact cannot be found or chat fails to open.
 */
async function searchAndOpenChat(phone) {
  const STAGE = "SEARCH_AND_OPEN";
  console.log(`[WA Auto] [${STAGE}] Searching for contact ${phone}`);
  
  const searchBox = await waitForElement(SELECTORS.searchBox);
  if (!searchBox) throw new Error(`[${STAGE}] Search box not found`);

  searchBox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  
  document.execCommand('insertText', false, phone);
  searchBox.dispatchEvent(new Event('input', { bubbles: true }));
  console.log(`[WA Auto] [${STAGE}] Typed phone number into search box`);

  // Wait for results
  await smartWait('div[aria-label="Search results."] div._ak8o', automationSettings.searchDelay);

  console.log(`[WA Auto] [${STAGE}] Looking for specific result cell (_ak8o)...`);
  const resultCell = document.querySelector('div[aria-label="Search results."] div[role="gridcell"][aria-colindex="2"]._ak8o');
  
  if (resultCell) {
    console.log(`[WA Auto] [${STAGE}] Found specific result cell, clicking...`);
    resultCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    resultCell.click();
    await smartWait(SELECTORS.messageBox, automationSettings.openChatDelay);
    return true;
  }

  const fallbackCell = document.querySelector('div[aria-label="Search results."] div._ak8o');
  if (fallbackCell) {
    console.log(`[WA Auto] [${STAGE}] Found fallback result cell, clicking...`);
    fallbackCell.click();
    await smartWait(SELECTORS.messageBox, automationSettings.openChatDelay);
    return true;
  }

  console.log(`[WA Auto] [${STAGE}] Contact not found in main search, trying "New Chat" fallback...`);
  const newChatBtn = await waitForElement(SELECTORS.newChatBtn);
  if (newChatBtn) {
    console.log(`[WA Auto] [${STAGE}] Clicking New Chat button`);
    newChatBtn.click();
    await smartWait(SELECTORS.newChatSearch, 2000);
    
    const newChatSearch = await waitForElement(SELECTORS.newChatSearch);
    if (newChatSearch) {
      console.log(`[WA Auto] [${STAGE}] Typing phone into New Chat search`);
      newChatSearch.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      
      document.execCommand('insertText', false, phone);
      newChatSearch.dispatchEvent(new Event('input', { bubbles: true }));
      await smartWait('div[aria-label="Search results"] div._ak8o', automationSettings.searchDelay);
      
      const newChatResult = document.querySelector('div[aria-label="Search results"] div._ak8o, div[role="listitem"] div._ak8o, div._ak8o');
      if (newChatResult) {
        console.log(`[WA Auto] [${STAGE}] Found result in New Chat, clicking...`);
        newChatResult.click();
        await smartWait(SELECTORS.messageBox, automationSettings.openChatDelay);
        return true;
      }
    }
  }

  throw new Error(`[${STAGE}] Contact ${phone} not found or chat failed to open`);
}

/**
 * Injects text into the message box and sends it.
 * @param {string} text - The message to send.
 * @throws {Error} - If the message box cannot be found.
 */
async function injectMessage(text) {
  const STAGE = "INJECT_MESSAGE";
  const safeText = text || "";
  console.log(`[WA Auto] [${STAGE}] Injecting message text...`);
  
  if (!safeText) return true;

  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error(`[${STAGE}] Message input box not found`);

  messageBox.click();
  await sleep(500);
  messageBox.focus();
  await sleep(500);

  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  document.execCommand('insertText', false, safeText);
  messageBox.dispatchEvent(new Event('input', { bubbles: true }));
  
  await sleep(1000);

  console.log(`[WA Auto] [${STAGE}] Sending message via Enter`);
  const eventOptions = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  messageBox.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
  messageBox.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
  messageBox.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  
  await sleep(automationSettings.sendDelay);
  return true;
}

/**
 * Handles file attachments using the "Paste" method.
 * This is faster as it bypasses the attachment menu.
 * @param {Object} attachment - Object containing name and dataUrl.
 * @param {string} caption - Optional text to send as a caption.
 * @throws {Error} - If the send button cannot be found in the preview.
 */
async function handleAttachment(attachment, caption = "") {
  const STAGE = "ATTACHMENT_PASTE";
  if (!attachment || !attachment.dataUrl) return true;

  console.log(`[WA Auto] [${STAGE}] Handling attachment: ${attachment.name}`);
  
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error(`[${STAGE}] Message box not found for pasting`);

  const res = await fetch(attachment.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], attachment.name || "attachment", { type: blob.type });

  messageBox.click();
  await sleep(500);
  messageBox.focus();
  await sleep(500);

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  const pasteEvent = new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true });
  messageBox.dispatchEvent(pasteEvent);

  console.log(`[WA Auto] [${STAGE}] Waiting for attachment preview...`);
  await smartWait(SELECTORS.captionBox, automationSettings.pasteDelay);

  const captionBox = document.querySelector(SELECTORS.captionBox);
  const sendBtnPreview = document.querySelector('button.xdj266r.x14z9mp[aria-label="Send"], span[data-icon="wds-ic-send-filled"], [role="button"][aria-label="Send"]');

  if (!captionBox && !sendBtnPreview) {
    console.warn(`[WA Auto] [${STAGE}] Paste method failed, trying fallback...`);
    return await handleAttachmentFallback(attachment, caption);
  }

  if (caption) {
    const activeCaptionBox = await waitForElement(SELECTORS.captionBox);
    if (activeCaptionBox) {
      activeCaptionBox.click();
      await sleep(800);
      activeCaptionBox.focus();
      await sleep(500);
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, caption);
      activeCaptionBox.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(1000);
    }
  }

  const sendBtn = sendBtnPreview || await waitForElement('button.xdj266r.x14z9mp[aria-label="Send"], span[data-icon="wds-ic-send-filled"], [role="button"][aria-label="Send"]');
  if (sendBtn) {
    (sendBtn.closest('button') || sendBtn).click();
    await sleep(automationSettings.sendDelay);
    return true;
  }
  throw new Error(`[${STAGE}] Send button not found in preview`);
}

/**
 * Fallback method for attachments using the standard "Attach" menu.
 * Used if the "Paste" method fails.
 * @param {Object} attachment - Object containing name and dataUrl.
 * @param {string} caption - Optional text to send as a caption.
 * @throws {Error} - If any part of the manual attachment process fails.
 */
async function handleAttachmentFallback(attachment, caption = "") {
  const STAGE = "ATTACHMENT_FALLBACK";
  console.log(`[WA Auto] [${STAGE}] Using file input method for: ${attachment.name}`);
  
  const isImage = /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(attachment.name);
  const targetLabel = isImage ? 'Photos & videos' : 'Document';

  const attachBtn = await waitForElement(SELECTORS.attachBtn);
  if (!attachBtn) throw new Error(`[${STAGE}] Attach button not found`);
  
  attachBtn.click();
  await sleep(2000);

  const menuBtn = await waitForElement(`button[aria-label="${targetLabel}"]`);
  if (!menuBtn) throw new Error(`[${STAGE}] Menu button "${targetLabel}" not found`);

  const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  let fileInput;
  if (isImage) {
    fileInput = allInputs.find(i => i.accept && (i.accept.includes('image') || i.accept.includes('video')));
  } else {
    fileInput = allInputs.find(i => i.accept === '*' || (i.accept && !i.accept.includes('image')));
  }

  if (!fileInput && allInputs.length > 0) {
    fileInput = isImage ? allInputs[0] : (allInputs.find(i => i.accept === '*') || allInputs[allInputs.length - 1]);
  }

  if (!fileInput) throw new Error(`[${STAGE}] No file input found`);

  const res = await fetch(attachment.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], attachment.name || "attachment", { type: blob.type });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  await sleep(5000);

  if (caption) {
    const cb = await waitForElement(SELECTORS.captionBox);
    if (cb) {
      cb.focus();
      document.execCommand('insertText', false, caption);
      cb.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(1000);
    }
  }

  const sendBtn = await waitForElement('button.xdj266r.x14z9mp[aria-label="Send"], span[data-icon="wds-ic-send-filled"], [role="button"][aria-label="Send"]');
  if (sendBtn) {
    (sendBtn.closest('button') || sendBtn).click();
    await sleep(2000);
    return true;
  }
  throw new Error(`[${STAGE}] Send button not found in fallback preview`);
}

async function clickSend() {
  console.log(`[WA Auto] Step 4: Clicking send button`);
  const sendBtn = await waitForElement(SELECTORS.sendBtn);
  if (sendBtn) {
    sendBtn.click();
    console.log(`[WA Auto] Send button clicked`);
    await sleep(1500);
    return true;
  }
  throw new Error("Send button not found");
}

/**
 * Message listener for commands from the background script.
 * Handles "process_row" to automate a single contact.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "process_row") {
    console.log(`[WA Auto] Received process_row command`);
    
    if (request.settings) {
      automationSettings = { ...automationSettings, ...request.settings };
      console.log(`[WA Auto] Updated automation settings:`, JSON.stringify(automationSettings));
    }
    
    (async () => {
      try {
        const { phone, message, attachment } = request.data;
        
        if (!phone) throw new Error("Phone number missing in request data");
        
        await searchAndOpenChat(phone);

        if (attachment) {
          // Send attachment with message as caption in one go
          await handleAttachment(attachment, message);
        } else {
          // Send message only
          await injectMessage(message);
        }

        console.log(`[WA Auto] Successfully processed contact: ${phone}`);
        sendResponse({ success: true });
      } catch (e) {
        console.error("[WA Auto] Automation Error:", e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
