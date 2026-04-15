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

        const { type, phone, requestId } = event.data;

        if (type === "WA_OPEN_CHAT") {
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

        if (type === "WA_GET_GROUPS") {
            try {
                let groups = [];
                if (window.WPP && window.WPP.group && window.WPP.group.getAllMine) {
                    groups = await window.WPP.group.getAllMine();
                } else if (window.BULK_WPP && window.BULK_WPP.group && window.BULK_WPP.group.getAllMine) {
                    groups = await window.BULK_WPP.group.getAllMine();
                } else {
                    throw new Error("Group API not available");
                }
                window.postMessage({ type: "WA_GET_GROUPS_RESULT", requestId, success: true, data: groups }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_GET_GROUPS_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }

        if (type === "WA_SCRAPE_GROUP") {
            try {
                let members = [];
                const chatId = phone.includes('@g.us') ? phone : phone + '@g.us';
                
                if (window.WPP && window.WPP.group && window.WPP.group.getParticipants) {
                    members = await window.WPP.group.getParticipants(chatId);
                } else if (window.BULK_WPP && window.BULK_WPP.group && window.BULK_WPP.group.getParticipants) {
                    members = await window.BULK_WPP.group.getParticipants(chatId);
                } else {
                    throw new Error("Scrape API not available");
                }
                window.postMessage({ type: "WA_SCRAPE_GROUP_RESULT", requestId, success: true, data: members }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_SCRAPE_GROUP_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }

        if (type === "WA_GET_CONTACTS") {
            try {
                let contacts = [];
                if (window.WPP && window.WPP.contact && window.WPP.contact.list) {
                    contacts = await window.WPP.contact.list();
                } else if (window.BULK_WPP && window.BULK_WPP.contact && window.BULK_WPP.contact.list) {
                    contacts = await window.BULK_WPP.contact.list();
                } else {
                    throw new Error("Contact API not available");
                }
                window.postMessage({ type: "WA_GET_CONTACTS_RESULT", requestId, success: true, data: contacts }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_GET_CONTACTS_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }
    });
})();
