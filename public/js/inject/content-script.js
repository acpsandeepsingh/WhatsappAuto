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

async function searchAndOpenChat(phone) {
  const searchBox = await waitForElement(SELECTORS.searchBox);
  if (!searchBox) throw new Error("Search box not found");

  searchBox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  document.execCommand('insertText', false, phone);
  searchBox.dispatchEvent(new Event('input', { bubbles: true }));

  await smartWait('div[aria-label="Search results."] div._ak8o', automationSettings.searchDelay);

  const resultCell = document.querySelector('div[aria-label="Search results."] div[role="gridcell"][aria-colindex="2"]._ak8o');
  if (resultCell) {
    resultCell.click();
    await smartWait(SELECTORS.messageBox, automationSettings.openChatDelay);
    return true;
  }

  const fallbackCell = document.querySelector('div[aria-label="Search results."] div._ak8o');
  if (fallbackCell) {
    fallbackCell.click();
    await smartWait(SELECTORS.messageBox, automationSettings.openChatDelay);
    return true;
  }

  const newChatBtn = await waitForElement(SELECTORS.newChatBtn);
  if (newChatBtn) {
    newChatBtn.click();
    await smartWait(SELECTORS.newChatSearch, 2000);
    const newChatSearch = await waitForElement(SELECTORS.newChatSearch);
    if (newChatSearch) {
      newChatSearch.focus();
      document.execCommand('insertText', false, phone);
      newChatSearch.dispatchEvent(new Event('input', { bubbles: true }));
      await smartWait('div[aria-label="Search results"] div._ak8o', automationSettings.searchDelay);
      const newChatResult = document.querySelector('div[aria-label="Search results"] div._ak8o');
      if (newChatResult) {
        newChatResult.click();
        await smartWait(SELECTORS.messageBox, automationSettings.openChatDelay);
        return true;
      }
    }
  }
  throw new Error(`Contact ${phone} not found`);
}

async function injectMessage(text) {
  if (!text) return true;
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message box not found");

  messageBox.click();
  messageBox.focus();
  document.execCommand('insertText', false, text);
  messageBox.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1000);

  const eventOptions = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  messageBox.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
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
        await searchAndOpenChat(phone);
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
