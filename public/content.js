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

  // NEW FALLBACK: Try "New Chat" button for numbers not in chat history
  console.log(`[WA Auto] Contact not found in main search, trying "New Chat" fallback...`);
  const newChatBtn = await waitForElement(SELECTORS.newChatBtn);
  if (newChatBtn) {
    console.log(`[WA Auto] Clicking New Chat button`);
    newChatBtn.click();
    await sleep(2000);
    
    const newChatSearch = await waitForElement(SELECTORS.newChatSearch);
    if (newChatSearch) {
      console.log(`[WA Auto] Typing phone into New Chat search`);
      newChatSearch.focus();
      // Clear if needed
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      
      document.execCommand('insertText', false, phone);
      newChatSearch.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(3000);
      
      // Look for the result in the new chat list
      const newChatResult = document.querySelector('div[aria-label="Search results"] div._ak8o, div[role="listitem"] div._ak8o, div._ak8o');
      if (newChatResult) {
        console.log(`[WA Auto] Found result in New Chat, clicking...`);
        newChatResult.click();
        await sleep(4000);
        return true;
      }
    }
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

async function handleAttachment(attachment, caption = "") {
  if (!attachment || !attachment.dataUrl) {
    console.log(`[WA Auto] No attachment for this contact`);
    return true;
  }

  console.log(`[WA Auto] Step 3: Handling attachment (Paste Method): ${attachment.name}`);
  
  const messageBox = await waitForElement(SELECTORS.messageBox);
  if (!messageBox) throw new Error("Message box not found for pasting");

  console.log(`[WA Auto] Preparing file from data URL`);
  const res = await fetch(attachment.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], attachment.name || "attachment", { type: blob.type });

  // Focus and click message box to ensure it's ready
  messageBox.click();
  await sleep(500);
  messageBox.focus();
  await sleep(500);

  console.log(`[WA Auto] Simulating paste event...`);
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  
  const pasteEvent = new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true
  });
  
  messageBox.dispatchEvent(pasteEvent);
  console.log(`[WA Auto] Paste event dispatched`);

  // Wait to see if preview appears
  console.log(`[WA Auto] Waiting for attachment preview to load...`);
  await sleep(4000);

  // Check if we are in the attachment preview by looking for the caption box or send button
  const captionBox = document.querySelector(SELECTORS.captionBox);
  const sendBtnPreview = document.querySelector('button.xdj266r.x14z9mp[aria-label="Send"], span[data-icon="wds-ic-send-filled"], [role="button"][aria-label="Send"]');

  if (!captionBox && !sendBtnPreview) {
    console.warn(`[WA Auto] Paste method didn't seem to trigger preview, falling back to file input method...`);
    return await handleAttachmentFallback(attachment, caption);
  }

  // Inject caption if provided
  if (caption) {
    console.log(`[WA Auto] Injecting caption into preview...`);
    const activeCaptionBox = await waitForElement(SELECTORS.captionBox);
    if (activeCaptionBox) {
      console.log(`[WA Auto] Found caption box, clicking and focusing...`);
      activeCaptionBox.click();
      await sleep(800);
      activeCaptionBox.focus();
      await sleep(500);
      
      // Clear any existing text just in case
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      
      document.execCommand('insertText', false, caption);
      activeCaptionBox.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(`[WA Auto] Caption injected`);
      await sleep(1500);
    } else {
      console.warn(`[WA Auto] Caption box not found in preview`);
    }
  }

  console.log(`[WA Auto] Clicking send in preview...`);
  const sendBtn = sendBtnPreview || await waitForElement('button.xdj266r.x14z9mp[aria-label="Send"], span[data-icon="wds-ic-send-filled"], [role="button"][aria-label="Send"]');
  
  if (sendBtn) {
    const actualBtn = sendBtn.closest('button') || sendBtn;
    actualBtn.click();
    await sleep(2000);
    return true;
  }
  
  throw new Error("Could not find send button in preview after paste");
}

async function handleAttachmentFallback(attachment, caption = "") {
  console.log(`[WA Auto] FALLBACK: Using file input method for: ${attachment.name}`);
  
  const isImage = /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(attachment.name);
  const targetLabel = isImage ? 'Photos & videos' : 'Document';

  const attachBtn = await waitForElement(SELECTORS.attachBtn);
  if (!attachBtn) throw new Error("Attach button not found in fallback");
  
  attachBtn.click();
  await sleep(2000);

  const menuBtn = await waitForElement(`button[aria-label="${targetLabel}"]`);
  if (!menuBtn) throw new Error(`Menu button "${targetLabel}" not found in fallback`);

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

  if (!fileInput) throw new Error("No file input found in fallback");

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
  throw new Error("Send button not found in fallback preview");
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
