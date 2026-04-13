/**
 * This script is injected into the MAIN world of WhatsApp Web.
 * It has direct access to page globals like window.WPP or window.BULK_WPP.
 */
(function() {
    if (window._WA_INJECT_LOADED) return;
    window._WA_INJECT_LOADED = true;

    console.log("[WA-INJECT] MAIN world script initialized");

    window.addEventListener("message", async (event) => {
        // Only accept messages from ourselves
        if (event.source !== window) return;

        if (event.data && event.data.type === "WA_OPEN_CHAT") {
            const { phone, requestId } = event.data;
            console.log("[WA-INJECT] Received request to open chat:", phone);

            try {
                // Format the ID correctly
                let chatId = phone;
                if (!chatId.includes("@")) {
                    // Clean phone number and append @c.us
                    chatId = phone.replace(/[^\d]/g, "") + "@c.us";
                }

                let success = false;
                let error = null;

                console.log("[WA-INJECT] Available globals:", {
                    WPP: !!window.WPP,
                    BULK_WPP: !!window.BULK_WPP,
                    WA_REQ: !!window.__WA_REQ__
                });

                // Try different internal methods
                if (window.BULK_WPP && window.BULK_WPP.chat && window.BULK_WPP.chat.openChatAt) {
                    console.log("[WA-INJECT] Using BULK_WPP.chat.openChatAt");
                    await window.BULK_WPP.chat.openChatAt(chatId);
                    success = true;
                } else if (window.WPP && window.WPP.chat && window.WPP.chat.open) {
                    console.log("[WA-INJECT] Using WPP.chat.open");
                    await window.WPP.chat.open(chatId);
                    success = true;
                } else if (window.BULK_WPP && window.BULK_WPP.whatsapp && window.BULK_WPP.whatsapp.Cmd && window.BULK_WPP.whatsapp.Cmd.openChatAt) {
                    console.log("[WA-INJECT] Using BULK_WPP.whatsapp.Cmd.openChatAt");
                    // We might need to find the chat model first
                    const chat = await window.BULK_WPP.chat.find(chatId);
                    await window.BULK_WPP.whatsapp.Cmd.openChatAt(chat);
                    success = true;
                } else {
                    // Try to find internal Cmd if WPP is not available but we have access to webpack modules
                    // This is a fallback if the library isn't fully initialized
                    console.error("[WA-INJECT] WPP/BULK_WPP not fully available");
                    error = "Internal WhatsApp API not found. Please wait for page to fully load.";
                }

                window.postMessage({
                    type: "WA_OPEN_CHAT_RESULT",
                    requestId,
                    success,
                    error,
                    phone
                }, "*");

            } catch (err) {
                console.error("[WA-INJECT] Error in MAIN world:", err);
                window.postMessage({
                    type: "WA_OPEN_CHAT_RESULT",
                    requestId,
                    success: false,
                    error: err.message,
                    phone
                }, "*");
            }
        }
    });
})();
