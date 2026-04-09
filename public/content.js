// content.js
console.log("WhatsApp Automation: Content Script Loaded");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SELECTORS = {
  searchBox: 'div[contenteditable="true"][data-tab="3"], input[title="Search or start new chat"]',
  chatList: '#pane-side [role="grid"]',
  chatRow: '[role="row"]',
  messageBox: 'footer div[contenteditable="true"][data-tab="10"], footer div[role="textbox"]',
  sendBtn: 'span[data-icon="send"]',
  attachBtn: 'div[aria-label="Attach"], span[data-icon="plus-rounded"]',
  fileInput: 'input[type="file"]'
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

async function searchAndOpenChat(phone) {
  const searchBox = await waitForElement(SELECTORS.searchBox);
  if (!searchBox) throw new Error("Search box not found");

  searchBox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  document.execCommand('insertText', false, phone);
  searchBox.dispatchEvent(new Event('input', { bubbles: true }));

  await sleep(2500); // Wait for results to filter

  const results = document.querySelectorAll(SELECTORS.chatRow);
  if (results.length > 0) {
    // Click the first result that isn't a header or "No chats found"
    for (const row of results) {
      if (row.textContent.includes(phone) || row.querySelector('[title]')) {
        row.click();
        await sleep(1500);
        return true;
      }
    }
  }

  throw new Error(`Contact ${phone} not found in search results`);
}

async function injectMessage(text) {
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message input box not found");

  messageBox.focus();
  document.execCommand('insertText', false, text);
  messageBox.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(800);
  return true;
}

async function handleAttachment(attachment) {
  if (!attachment || !attachment.dataUrl) return true;

  const attachBtn = await waitForElement(SELECTORS.attachBtn);
  if (!attachBtn) throw new Error("Attach button not found");
  attachBtn.click();
  await sleep(1000);

  const fileInput = document.querySelector(SELECTORS.fileInput);
  if (!fileInput) throw new Error("File input not found after clicking attach");

  const res = await fetch(attachment.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], attachment.name || "attachment", { type: blob.type });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  await sleep(3000); // Wait for upload preview

  const sendBtn = await waitForElement(SELECTORS.sendBtn);
  if (sendBtn) {
    sendBtn.click();
    await sleep(1000);
    return true;
  }
  throw new Error("Send button not found in attachment preview");
}

async function clickSend() {
  const sendBtn = await waitForElement(SELECTORS.sendBtn);
  if (sendBtn) {
    sendBtn.click();
    await sleep(1000);
    return true;
  }
  throw new Error("Send button not found");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "process_row") {
    (async () => {
      try {
        const { phone, message, attachment } = request.data;
        
        await searchAndOpenChat(phone);
        await injectMessage(message);

        if (attachment) {
          await handleAttachment(attachment);
        } else {
          await clickSend();
        }

        sendResponse({ success: true });
      } catch (e) {
        console.error("Automation Error:", e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
