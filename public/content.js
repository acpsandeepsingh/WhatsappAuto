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
  // Message input box - broadened to handle Lexical variations
  messageBox: 'footer div[contenteditable="true"][data-tab="10"], div.lexical-rich-text-input div[contenteditable="true"]',
  // Send button (appears after typing or in attachment preview)
  sendBtn: 'span[data-icon="send"], span[data-icon="wds-ic-send-filled"], button[aria-label="Send"]',
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

  // Target the specific cell suggested by the user: div[role="gridcell"][aria-colindex="2"]._ak8o
  console.log(`[WA Auto] Looking for specific result cell (_ak8o)...`);
  const resultCell = document.querySelector('div[aria-label="Search results."] div[role="gridcell"][aria-colindex="2"]._ak8o');
  
  if (resultCell) {
    console.log(`[WA Auto] Found specific result cell, clicking...`);
    // Dispatching mousedown and click to be more thorough
    resultCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    resultCell.click();
    await sleep(4000); // Wait longer for chat to open
    return true;
  }

  // Fallback: search for any _ak8o in the search results
  const fallbackCell = document.querySelector('div[aria-label="Search results."] div._ak8o');
  if (fallbackCell) {
    console.log(`[WA Auto] Found fallback result cell, clicking...`);
    fallbackCell.click();
    await sleep(4000);
    return true;
  }

  throw new Error(`Contact ${phone} not found or chat failed to open`);
}

async function injectMessage(text) {
  const safeText = text || "";
  console.log(`[WA Auto] Step 2: Injecting message text (len: ${safeText.length}): ${safeText.substring(0, 20)}...`);
  
  if (!safeText) {
    console.warn("[WA Auto] No message text to inject");
    return true;
  }

  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message input box not found");

  // Click then focus to ensure the editor is active
  messageBox.click();
  await sleep(500);
  messageBox.focus();
  await sleep(500);

  // Clear existing text
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  
  // Inject text using insertText which is best for Lexical/React editors
  console.log(`[WA Auto] Attempting to inject text via execCommand...`);
  document.execCommand('insertText', false, safeText);
  
  // Dispatch input event to trigger React state update
  messageBox.dispatchEvent(new Event('input', { bubbles: true }));
  
  // Verify injection
  const currentText = messageBox.innerText || messageBox.textContent;
  console.log(`[WA Auto] Verification - Box content length: ${currentText.length}`);
  
  if (currentText.length === 0) {
    console.warn(`[WA Auto] execCommand failed to show text, trying fallback injection...`);
    // Fallback: Set textContent directly and dispatch events
    messageBox.textContent = safeText;
    messageBox.dispatchEvent(new Event('input', { bubbles: true }));
    messageBox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  await sleep(1500);

  // Send via Enter keypress as requested
  console.log(`[WA Auto] Sending message via Enter keypress`);
  
  const eventOptions = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };

  messageBox.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
  messageBox.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
  messageBox.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  
  console.log(`[WA Auto] Enter keypress events dispatched`);
  
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

  await sleep(5000); // Wait for upload preview to load and become interactive

  console.log(`[WA Auto] Looking for send button in attachment preview...`);
  // Precise selector based on user feedback and DOM observation
  const sendBtnSelector = 'button.xdj266r.x14z9mp[aria-label="Send"], span[data-icon="wds-ic-send-filled"]';
  const sendBtn = await waitForElement(sendBtnSelector);
  
  if (sendBtn) {
    console.log(`[WA Auto] Found send button, clicking...`);
    const actualBtn = sendBtn.closest('button') || sendBtn;
    actualBtn.click();
    await sleep(2000);
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
    console.log(`[WA Auto] Received process_row command`);
    console.log(`[WA Auto] Data:`, JSON.stringify(request.data));
    
    (async () => {
      try {
        const { phone, message, attachment } = request.data;
        
        if (!phone) throw new Error("Phone number missing in request data");
        
        await searchAndOpenChat(phone);
        await injectMessage(message);

        if (attachment) {
          await handleAttachment(attachment);
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
