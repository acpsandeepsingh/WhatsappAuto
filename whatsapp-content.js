/**
 * WhatsApp Content Script
 * Handles DOM interactions with WhatsApp Web.
 */

(() => {
  if (window.__WA_AUTOMATION_CONTENT_READY__) return;
  window.__WA_AUTOMATION_CONTENT_READY__ = true;

  console.log("[WA] Content script loaded");

  const SELECTORS = {
    searchBox: 'div[contenteditable="true"][data-tab="3"], #side div[contenteditable="true"]',
    messageBox: 'footer div[contenteditable="true"][data-tab="10"], div.lexical-rich-text-input div[contenteditable="true"]',
    sendBtn: 'span[data-icon="send"], button[aria-label="Send"]',
    attachBtn: 'div[role="button"][title="Attach"], span[data-icon="plus"]',
    fileInput: 'input[type="file"]',
    chatRows: '#pane-side [role="row"]',
    groupTitle: 'header span[title]',
  };

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  /**
   * Waits for an element to appear in the DOM.
   */
  async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) return el;
      await wait(500);
    }
    return null;
  }

  /**
   * Introduces random delays to mimic human behavior.
   */
  async function smartWait(min = 2000, max = 5000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await wait(delay);
  }

  /**
   * Searches for a contact and opens the chat.
   */
  async function searchAndOpenChat(phone) {
    console.log(`[WA] Searching for: ${phone}`);
    const searchBox = await waitForElement(SELECTORS.searchBox);
    if (!searchBox) throw new Error("Search box not found");

    searchBox.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, phone);
    searchBox.dispatchEvent(new Event('input', { bubbles: true }));

    await wait(2000);

    const firstChat = await waitForElement(SELECTORS.chatRows);
    if (!firstChat) throw new Error("Chat not found in results");

    firstChat.click();
    await wait(1500);
  }

  /**
   * Injects a message into the active chat.
   */
  async function injectMessage(message) {
    const msgBox = await waitForElement(SELECTORS.messageBox);
    if (!msgBox) throw new Error("Message box not found");

    msgBox.focus();
    document.execCommand('insertText', false, message);
    msgBox.dispatchEvent(new Event('input', { bubbles: true }));
    
    await wait(500);
    
    const sendBtn = await waitForElement(SELECTORS.sendBtn);
    if (!sendBtn) throw new Error("Send button not found");
    
    sendBtn.click();
  }

  /**
   * Handles file attachments.
   */
  async function handleAttachment(fileUrl, caption = "") {
    const attachBtn = await waitForElement(SELECTORS.attachBtn);
    if (!attachBtn) throw new Error("Attach button not found");

    attachBtn.click();
    await wait(1000);

    const fileInput = document.querySelector(SELECTORS.fileInput);
    if (!fileInput) throw new Error("File input not found");

    // Fetch the file and create a File object
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const file = new File([blob], "attachment", { type: blob.type });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await wait(2000);

    if (caption) {
      const captionBox = await waitForElement('div[contenteditable="true"][data-tab="10"]'); // Caption box usually same as msg box in preview
      if (captionBox) {
        captionBox.focus();
        document.execCommand('insertText', false, caption);
      }
    }

    const sendBtn = await waitForElement(SELECTORS.sendBtn);
    if (sendBtn) sendBtn.click();
  }

  /**
   * Scrapes contacts from the currently opened group.
   */
  async function scrapeGroups() {
    const rows = document.querySelectorAll(SELECTORS.chatRows);
    const contacts = [];
    rows.forEach(row => {
      const title = row.querySelector('span[title]')?.title;
      const phone = row.querySelector('span[dir="auto"]')?.textContent;
      if (title || phone) contacts.push({ name: title, phone });
    });
    return contacts;
  }

  /**
   * Orchestrates sending a single message.
   */
  async function sendSingleMessage(data) {
    const { phone, message, attachmentUrl, caption } = data;
    
    try {
      await searchAndOpenChat(phone);
      await smartWait(1000, 3000);
      
      if (attachmentUrl) {
        await handleAttachment(attachmentUrl, caption || message);
      } else {
        await injectMessage(message);
      }
      
      return { success: true };
    } catch (error) {
      console.error(`[WA] Failed to send to ${phone}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SEND_MESSAGE" || request.action === "process_row") {
      sendSingleMessage(request.data).then(sendResponse);
      return true;
    }
    if (request.action === "SCRAPE_GROUPS") {
      scrapeGroups().then(contacts => sendResponse({ success: true, data: contacts }));
      return true;
    }
    if (request.action === "PING") {
      sendResponse({ success: true });
      return true;
    }
  });

})();
