/**
 * This script is injected into the MAIN world of WhatsApp Web.
 * It has direct access to page globals like window.WPP or window.BULK_WPP.
 */
(function() {
    if (window._WA_INJECT_LOADED) return;
    window._WA_INJECT_LOADED = true;

    console.log("WhatsApp Automation Initialized");

    window.addEventListener("message", async (event) => {
        if (event.source !== window) return;

        if (event.data && event.data.type === "WA_OPEN_CHAT") {
            const { phone, requestId } = event.data;
            try {
                let chatId = phone;
                if (!chatId.includes("@")) {
                    chatId = phone.replace(/[^\d]/g, "") + "@c.us";
                }

                let success = false;
                let error = null;

                if (window.BULK_WPP && window.BULK_WPP.chat && window.BULK_WPP.chat.openChatAt) {
                    await window.BULK_WPP.chat.openChatAt(chatId);
                    success = true;
                } else if (window.WPP && window.WPP.chat && window.WPP.chat.open) {
                    await window.WPP.chat.open(chatId);
                    success = true;
                } else {
                    error = "Internal WhatsApp API not found.";
                }

                window.postMessage({ type: "WA_OPEN_CHAT_RESULT", requestId, success, error, phone }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_OPEN_CHAT_RESULT", requestId, success: false, error: err.message, phone }, "*");
            }
        }
    });
})();
