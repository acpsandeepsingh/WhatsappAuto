// content.js
console.log("WhatsApp Automation: Content Script Loaded");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SELECTORS = {
  // Search box is an input with data-tab="3"
  searchBox: 'input[data-tab="3"], #_r_b_',
  // Chat list container
  chatList: '#pane-side [role="grid"]',
  // Individual chat row
  chatRow: '[role="row"]',
  // Message input box
  messageBox: 'footer div[contenteditable="true"][data-tab="10"]',
  // Send button (appears after typing)
  sendBtn: 'span[data-icon="send"], button:has(span[data-icon="send"])',
  // Attach button (the plus icon)
  attachBtn: 'button[data-tab="10"][aria-label="Attach"]',
  // File input is usually hidden in the footer
  fileInput: 'footer input[type="file"]'
};

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

async function searchAndOpenChat(phone) {
  console.log(`[WA Auto] Step 1: Searching for contact ${phone}`);
  const searchBox = await waitForElement(SELECTORS.searchBox);
  if (!searchBox) throw new Error("Search box not found");

  searchBox.focus();
  // Clear existing text using execCommand to ensure React state updates
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  
  // Type the phone number
  document.execCommand('insertText', false, phone);
  searchBox.dispatchEvent(new Event('input', { bubbles: true }));
  console.log(`[WA Auto] Typed phone number into search box`);

  await sleep(3000); // Wait for results to filter

  // Try the user suggested selector first: div[role="gridcell"][aria-colindex="2"]._ak8o
  console.log(`[WA Auto] Looking for search result cell (_ak8o)...`);
  const resultCell = document.querySelector('div[aria-label="Search results."] div._ak8o');
  
  if (resultCell) {
    console.log(`[WA Auto] Found result cell, clicking...`);
    resultCell.click();
    await sleep(3000); // Wait for chat to open
    return true;
  }

  // Fallback to row logic if specific cell not found
  const results = document.querySelectorAll(SELECTORS.chatRow);
  console.log(`[WA Auto] Fallback: Found ${results.length} potential chat results`);
  
  if (results.length > 0) {
    for (const row of results) {
      const text = row.textContent || "";
      if (text.trim() === "Chats") continue;
      
      console.log(`[WA Auto] Clicking chat row: ${text.substring(0, 20)}...`);
      row.click();
      await sleep(3000);
      return true;
    }
  }

  throw new Error(`Contact ${phone} not found in search results`);
}

async function injectMessage(text) {
  console.log(`[WA Auto] Step 2: Injecting message text`);
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message input box not found");

  messageBox.focus();
  document.execCommand('insertText', false, text);
  messageBox.dispatchEvent(new Event('input', { bubbles: true }));
  console.log(`[WA Auto] Message text injected`);
  await sleep(1000);
  return true;
}

async function handleAttachment(attachment) {
  if (!attachment || !attachment.dataUrl) {
    console.log(`[WA Auto] No attachment for this contact`);
    return true;
  }

  console.log(`[WA Auto] Step 3: Handling attachment: ${attachment.name}`);
  const attachBtn = await waitForElement(SELECTORS.attachBtn);
  if (!attachBtn) throw new Error("Attach button not found");
  
  console.log(`[WA Auto] Clicking attach button`);
  attachBtn.click();
  await sleep(1500);

  const fileInput = document.querySelector(SELECTORS.fileInput);
  if (!fileInput) throw new Error("File input not found in footer");

  console.log(`[WA Auto] Preparing file from data URL`);
  const res = await fetch(attachment.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], attachment.name || "attachment", { type: blob.type });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  console.log(`[WA Auto] File attached to input`);

  await sleep(4000); // Wait for upload preview to load

  const sendBtn = await waitForElement(SELECTORS.sendBtn);
  if (sendBtn) {
    console.log(`[WA Auto] Clicking send button in attachment preview`);
    sendBtn.click();
    await sleep(1500);
    return true;
  }
  throw new Error("Send button not found in attachment preview");
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "process_row") {
    console.log(`[WA Auto] Received process_row command for: ${request.data.phone}`);
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
