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

        if (event.data && event.data.type === "WA_SEND_MESSAGE") {
            const { phone, message, requestId } = event.data;
            console.log("[WA-INJECT] Received request to send message:", phone);

            try {
                let chatId = phone;
                if (!chatId.includes("@")) {
                    chatId = phone.replace(/[^\d]/g, "") + "@c.us";
                }

                let success = false;
                let error = null;

                if (window.BULK_WPP && window.BULK_WPP.chat && window.BULK_WPP.chat.sendTextMessage) {
                    await window.BULK_WPP.chat.sendTextMessage(chatId, message);
                    success = true;
                } else if (window.WPP && window.WPP.chat && window.WPP.chat.sendTextMessage) {
                    await window.WPP.chat.sendTextMessage(chatId, message);
                    success = true;
                } else {
                    error = "Internal Send API not found.";
                }

                window.postMessage({ type: "WA_SEND_MESSAGE_RESULT", requestId, success, error, phone }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_SEND_MESSAGE_RESULT", requestId, success: false, error: err.message, phone }, "*");
            }
        }

        if (event.data && event.data.type === "WA_GET_GROUPS") {
            const { requestId, filter, groupName } = event.data;
            console.log("[WA-INJECT] Received request to get groups/contacts", { filter, groupName });

            try {
                let results = [];
                
                if (filter && filter.primary === 'group' && filter.secondary) {
                    // Scrape members of a specific group
                    console.log("[WA-INJECT] Scraping members for group:", filter.secondary);
                    if (window.BULK_WPP && window.BULK_WPP.group && window.BULK_WPP.group.getParticipants) {
                        const participants = await window.BULK_WPP.group.getParticipants(filter.secondary);
                        results = participants.map(p => ({
                            id: p.id._serialized,
                            phone: p.id.user,
                            name: p.name || p.pushname || p.formattedName || p.id.user,
                            isGroup: false
                        }));
                    }
                } else if (window.BULK_WPP && window.BULK_WPP.chat && window.BULK_WPP.chat.list) {
                    const list = await window.BULK_WPP.chat.list();
                    results = list.map(c => ({
                        id: c.id._serialized,
                        phone: c.id.user,
                        name: c.name || c.formattedName || c.id.user,
                        isGroup: c.isGroup
                    }));
                } else if (window.WPP && window.WPP.chat && window.WPP.chat.list) {
                    const list = await window.WPP.chat.list();
                    results = list.map(c => ({
                        id: c.id._serialized,
                        phone: c.id.user,
                        name: c.name || c.formattedName || c.id.user,
                        isGroup: c.isGroup
                    }));
                }

                window.postMessage({ type: "WA_GET_GROUPS_RESULT", requestId, success: true, groups: results }, "*");
            } catch (err) {
                console.error("[WA-INJECT] Error getting groups/contacts:", err);
                window.postMessage({ type: "WA_GET_GROUPS_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }
    });
})();
