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
            request.onerror = () => reject(new Error(`Failed to open IndexedDB: ${dbName}`));
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
                getAllRequest.onerror = () => reject(new Error(`Failed to get data from store: ${storeName}`));
            };
        });
    }

    async function getGroupsFromDB() {
        try {
            const rows = await getFromIndexedDB("model-storage", "group-metadata");
            return rows.map(row => ({
                id: row.id,
                subject: row.subject || row.name || "Unknown Group",
                isGroup: true
            }));
        } catch (e) {
            console.error("Group extraction failed:", e);
            return [];
        }
    }

    async function scrapeGroupMembersFromDB(groupId) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("model-storage");
            request.onerror = () => reject(new Error("Failed to open model-storage"));
            request.onsuccess = async (event) => {
                const db = event.target.result;
                try {
                    const tx = db.transaction(["group-metadata", "participant", "contact"], "readonly");
                    const groupStore = tx.objectStore("group-metadata");
                    const participantStore = tx.objectStore("participant");
                    const contactStore = tx.objectStore("contact");

                    const groupReq = groupStore.get(groupId);
                    const allParticipantsReq = participantStore.getAll();

                    groupReq.onsuccess = () => {
                        const group = groupReq.result;
                        allParticipantsReq.onsuccess = async () => {
                            const participantRows = allParticipantsReq.result || [];
                            const participantRecord = participantRows.find(r => r.groupId === groupId || r.id === groupId);

                            if (!participantRecord || !Array.isArray(participantRecord.participants)) {
                                return resolve([]);
                            }

                            const results = [];
                            for (const lid of participantRecord.participants) {
                                // We can't do await inside onsuccess easily without more promises
                                // So we'll collect all keys and do a bulk get if possible, or just another promise
                            }
                            
                            // Better way: get all contacts and filter
                            const allContactsReq = contactStore.getAll();
                            allContactsReq.onsuccess = () => {
                                const allContacts = allContactsReq.result || [];
                                const contactMap = new Map(allContacts.map(c => [c.id, c]));
                                
                                const finalMembers = participantRecord.participants.map(lid => {
                                    const c = contactMap.get(lid);
                                    return {
                                        id: lid,
                                        name: c?.name || c?.pushname || "Unknown",
                                        phone: c?.phoneNumber ? String(c.phoneNumber).replace(/@c\.us$/, "") : lid.split('@')[0]
                                    };
                                });
                                resolve(finalMembers);
                            };
                        };
                    };
                } catch (e) {
                    reject(e);
                }
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
                    window.postMessage({ type: "WA_OPEN_CHAT_RESULT", requestId, success: false, error: "Internal API missing. Using DOM fallback.", useFallback: true, phone }, "*");
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
                    console.log("WhatsApp Automation: Using user-provided DB logic for groups");
                    groups = await getGroupsFromDB();
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
                    console.log("WhatsApp Automation: Using user-provided DB logic for scraping");
                    members = await scrapeGroupMembersFromDB(chatId);
                }
                window.postMessage({ type: "WA_SCRAPE_GROUP_RESULT", requestId, success: true, data: members }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_SCRAPE_GROUP_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }

        if (type === "WA_GET_CONTACTS") {
            try {
                let contacts = [];
                const filter = event.data.filter || {};
                
                if (filter.primary === 'group' && filter.secondary) {
                    console.log("WhatsApp Automation: Fetching members for group", filter.secondary);
                    contacts = await scrapeGroupMembersFromDB(filter.secondary);
                } else {
                    let rawList = [];
                    const wpp = window.WPP || window.BULK_WPP;
                    
                    if (wpp && wpp.chat && wpp.chat.list) {
                        const allChats = await wpp.chat.list();
                        if (filter.primary === 'unread_chats') {
                            // Better unread check: include those with unread messages or mentions
                            rawList = allChats.filter(c => 
                                c.unreadCount > 0 || 
                                c.hasUnread || 
                                c.isUnread || 
                                c.isUnreadType || 
                                (c.id && c.id._serialized && c.unreadCount > 0)
                            );
                        } else if (filter.primary === 'group') {
                            rawList = allChats.filter(c => c.isGroup || (c.id && c.id._serialized && c.id._serialized.includes('@g.us')));
                        } else if (filter.primary === 'saved_contacts') {
                            // Fetch all contacts and filter by those in address book
                            const allContacts = (wpp.contact && wpp.contact.list) ? await wpp.contact.list() : [];
                            rawList = allContacts.filter(c => 
                                c.isMyContact || 
                                c.isAddressBookContact || 
                                (c.name && !c.isGroup && (!c.id || !c.id.includes('@g.us')))
                            );
                        } else {
                            rawList = allChats;
                        }
                    } else {
                        // Fallback to IndexedDB
                        console.log("WhatsApp Automation: Falling back to contact store for filter:", filter.primary);
                        const rows = await getFromIndexedDB("model-storage", "contact");
                        if (filter.primary === 'unread_chats') {
                            rawList = rows.filter(c => c.unreadCount > 0 || c.hasUnread); 
                        } else if (filter.primary === 'group') {
                            rawList = rows.filter(c => c.id && c.id.includes('@g.us'));
                        } else if (filter.primary === 'saved_contacts') {
                            rawList = rows.filter(c => c.isMyContact || c.name);
                        } else {
                            rawList = rows;
                        }
                    }

                    contacts = rawList.map(c => {
                        const id = typeof c.id === 'object' ? c.id._serialized : c.id;
                        let phone = (c.id && typeof c.id === 'object') ? c.id.user : (c.id ? c.id.split('@')[0] : "");
                        
                        // Clean phone number: remove non-digits
                        const cleanPhone = phone.replace(/\D/g, "");
                        
                        return {
                            id: id,
                            name: c.name || c.pushname || c.formattedName || "Unknown",
                            phone: cleanPhone || phone
                        };
                    }).filter(c => {
                        // Filter out non-numeric phone numbers unless it's a group
                        const isGroup = c.id && c.id.includes('@g.us');
                        if (isGroup) return true;
                        
                        // Valid mobile numbers are usually 8-14 digits
                        // 15 digits or more are often internal IDs or service numbers
                        return /^\d{8,14}$/.test(c.phone);
                    });

                    // Deduplicate by phone number mainly, but keep groups separate
                    const seen = new Set();
                    contacts = contacts.filter(c => {
                        const key = c.id.includes('@g.us') ? c.id : c.phone;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                }
                window.postMessage({ type: "WA_GET_CONTACTS_RESULT", requestId, success: true, data: contacts }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_GET_CONTACTS_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }

        if (type === "WA_GET_CHAT_SNAPSHOT") {
            try {
                let chats = [];
                const wpp = window.WPP || window.BULK_WPP;
                if (wpp && wpp.chat && wpp.chat.list) {
                    chats = await wpp.chat.list();
                } else {
                    chats = await getFromIndexedDB("model-storage", "chat");
                }
                
                const data = chats.map(c => ({
                    id: typeof c.id === 'object' ? c.id._serialized : c.id,
                    name: c.name || c.pushname || c.formattedName || "Unknown",
                    phone: (c.id && typeof c.id === 'object') ? c.id.user : (c.id ? c.id.split('@')[0] : ""),
                    unreadCount: c.unreadCount || 0,
                    isGroup: c.isGroup || (c.id && c.id._serialized && c.id._serialized.includes('@g.us')),
                    lastMessage: c.lastMessage ? (c.lastMessage.body || c.lastMessage.text || "") : ""
                }));
                
                window.postMessage({ type: "WA_GET_CHAT_SNAPSHOT_RESULT", requestId, success: true, data }, "*");
            } catch (err) {
                window.postMessage({ type: "WA_GET_CHAT_SNAPSHOT_RESULT", requestId, success: false, error: err.message }, "*");
            }
        }
    });
})();
