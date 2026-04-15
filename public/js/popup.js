console.log("Popup script loaded");
document.getElementById('app').innerHTML = `
  <div style="width: 200px; padding: 16px; font-family: sans-serif;">
    <h3 style="margin-top: 0;">WhatsApp Automation</h3>
    <button id="openDashboard" style="width: 100%; padding: 8px; cursor: pointer; background: #25d366; color: white; border: none; border-radius: 4px; font-weight: bold;">
      Open Dashboard
    </button>
  </div>
`;

document.getElementById('openDashboard').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('index.html'));
  }
});
