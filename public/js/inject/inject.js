/**
 * This script is injected into the MAIN world of WhatsApp Web.
 * It has direct access to page globals like window.WPP or window.BULK_WPP.
 */
(function() {
    if (window._WA_INJECT_LOADED) return;
    window._WA_INJECT_LOADED = true;

    console.log("WhatsApp Automation Initialized");

    async function getFromIndexedDB(dbName, storeName, filterFn = () => true) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onerror = () => reject(new Error("Failed to open IndexedDB"));
            request.onsuccess = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    return resolve([]);
                }
                const transaction = db.transaction(storeName, "readonly");
                const store = transaction.objectStore(storeName);
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    resolve(getAllRequest.result.filter(filterFn));
                };
                getAllRequest.onerror = () => reject(new Error("Failed to get data from store"));
            };
        });
    }

    window.addEventListener("message", async (event) => {
        if (event.source !== window) return;

        const { type, phone, requestId } = event.data;

        if (type === "WA_OPEN_CHAT") {
            try {
                let chatId = phone;
                if (!chatId.includes("@")) {
                    chatId = phone.replace(/[^\d]/g, "") + "@c.us";
                }

                if (window.BULK_WPP && window.BULK_WPP.chat && window.BULK_WPP.chat.openChatAt) {
                    await window.BULK_WPP.chat.openChatAt(chatId);
                    window.postMessage({ type: "WA_OPEN_CHAT_RESULT", requestId, success: true, phone }, "*");
                } else if (window.WPP && window.WPP.chat && window.WPP.chat.open) {
                    await window.WPP.chat.open(chatId);
                    window.postMessage({ type: "WA_OPEN_CHAT_RESULT", requestId, success: true, phone }, "*");
                } else {
                    // Fallback: use the URL method if internal API is missing
                    const number = chatId.split('@')[0];
                    const url = `https://web.whatsapp.com/send?phone=${number}`;
                    // We can't easily navigate without reload if we are in the main world and want to stay in the SPA
                    // But we can try to find the chat in the UI or use a hidden link
                    window.postMessage({ type: "WA_OPEN_CHAT_RESULT", requestId, success: false, error: "Internal API missing. Using fallback.", useFallback: true, phone }, "*");
                }
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
                    // Fallback to IndexedDB
                    console.log("WhatsApp Automation: Falling back to IndexedDB for groups");
                    const chats = await getFromIndexedDB("model-storage", "chat", (c) => c.id && c.id.includes("@g.us"));
                    groups = chats.map(c => ({
                        id: c.id,
                        subject: c.name || c.formattedTitle || "Unknown Group",
                        isGroup: true
                    }));
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
                    // Fallback to IndexedDB
                    console.log("WhatsApp Automation: Falling back to IndexedDB for group members");
                    const groupMetadata = await getFromIndexedDB("model-storage", "group-metadata", (g) => g.id === chatId);
                    if (groupMetadata && groupMetadata.length > 0) {
                        members = groupMetadata[0].participants || [];
                    } else {
                        throw new Error("Group metadata not found in IndexedDB. Please open the group manually once.");
                    }
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
                    // Fallback to IndexedDB
                    console.log("WhatsApp Automation: Falling back to IndexedDB for contacts");
                    const allContacts = await getFromIndexedDB("model-storage", "contact", (c) => c.id && c.id.includes("@c.us"));
                    contacts = allContacts.map(c => ({
                        id: c.id,
                        name: c.name || c.pushname || c.formattedName || "Unknown",
                        phone: c.id.split('@')[0]
                    }));
                }
                window.postMessage({ type: "WA_GET_CONTACTS_RESULT", requestId, success: true, data: contacts }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_GET_CONTACTS_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }
    });
})();
