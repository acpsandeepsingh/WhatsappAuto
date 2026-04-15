/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  MessageSquare, 
  Download, 
  Upload,
  Settings as SettingsIcon,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Square,
  FileSpreadsheet,
  Paperclip,
  X,
  Save,
  RefreshCw,
  FileText,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  Check,
  Clock,
  Send,
  Loader2,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface Contact {
  id: string;
  sr_no: string;
  name: string;
  phone: string;
  message_template: string;
  attachment?: {
    name: string;
    dataUrl: string;
  };
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'retrying';
  error?: string;
}

interface Group {
  id: string;
  subject: string;
}

interface AppSettings {
  minDelay: number;
  maxDelay: number;
  randomDelay: boolean;
  maxRetries: number;
  defaultTemplate: string;
  searchDelay: number;
  openChatDelay: number;
  pasteDelay: number;
  sendDelay: number;
  useSmartWait: boolean;
  useDirectOpen: boolean;
  autoStartTime?: string; // ISO string or empty
  autoStartEnabled?: boolean;
  attachment?: {
    name: string;
    dataUrl: string;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  minDelay: 2000,
  maxDelay: 5000,
  randomDelay: true,
  maxRetries: 3,
  defaultTemplate: "Hello {{name}}, this is a message for you.",
  searchDelay: 1500,
  openChatDelay: 2000,
  pasteDelay: 2000,
  sendDelay: 1000,
  useSmartWait: true,
  useDirectOpen: true,
  autoStartTime: "",
  autoStartEnabled: false
};

/**
 * Main Dashboard Component for WhatsApp Automation.
 * Handles contact management, automation control, and settings.
 */
export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups' | 'scraping'>('contacts');
  const [isScraping, setIsScraping] = useState(false);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<'idle' | 'running' | 'paused' | 'stopped'>('idle');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load state from chrome.storage or localStorage
  useEffect(() => {
    const loadData = async () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['contacts', 'settings', 'groups', 'selectedGroups']);
        if (result.contacts) setContacts(result.contacts);
        if (result.settings) setSettings(result.settings);
        if (result.groups) setGroups(result.groups);
        if (result.selectedGroups) setSelectedGroups(result.selectedGroups);
      } else {
        const savedContacts = localStorage.getItem('contacts');
        const savedSettings = localStorage.getItem('settings');
        const savedGroups = localStorage.getItem('groups');
        if (savedContacts) setContacts(JSON.parse(savedContacts));
        if (savedSettings) setSettings(JSON.parse(savedSettings));
        if (savedGroups) setGroups(JSON.parse(savedGroups));
      }
    };
    loadData();

    // Listen for status updates from background
    const listener = (message: any) => {
      if (message.action === "status_update") {
        setQueueStatus(message.status);
        
        if (message.error) toast.error(message.error);
        if (message.lastError && message.lastStatus === 'failed') {
          toast.error(`Failed: ${message.lastError}`);
        }
        
        // Update local status based on the specific contact that finished
        if (message.contactId) {
          setContacts(prev => {
            const newContacts = prev.map(c => {
              if (c.id === message.contactId) {
                return { ...c, status: message.lastStatus, error: message.lastError };
              }
              return c;
            });
            
            // Also update the current highlighting index based on the contactId
            const idx = newContacts.findIndex(c => c.id === message.contactId);
            if (idx !== -1) setCurrentIndex(idx);
            
            return newContacts;
          });
        } else if (message.currentIndex !== undefined && message.currentIndex === -1) {
          setCurrentIndex(-1);
        }
      }
    };
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  // Save state
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ contacts, settings, groups, selectedGroups });
    } else {
      localStorage.setItem('contacts', JSON.stringify(contacts));
      localStorage.setItem('settings', JSON.stringify(settings));
      localStorage.setItem('groups', JSON.stringify(groups));
      localStorage.setItem('selectedGroups', JSON.stringify(selectedGroups));
    }
  }, [contacts, settings, groups, selectedGroups]);

  // Auto-start logic
  useEffect(() => {
    if (!settings.autoStartTime || !settings.autoStartEnabled || queueStatus !== 'idle') return;

    const timer = setInterval(() => {
      const now = new Date();
      const scheduledTime = new Date(settings.autoStartTime!);
      
      if (now >= scheduledTime) {
        console.log("[App] Auto-start triggered");
        startQueue();
        // Disable auto-start after triggering
        setSettings(prev => ({ ...prev, autoStartEnabled: false }));
        clearInterval(timer);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(timer);
  }, [settings.autoStartTime, settings.autoStartEnabled, queueStatus, contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
    );
  }, [contacts, searchTerm]);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => 
      g.subject.toLowerCase().includes(groupSearchTerm.toLowerCase())
    );
  }, [groups, groupSearchTerm]);

  const openDirectChat = (phone: string, sendDraft = false, name?: string) => {
    if (!phone) {
      toast.error("Contact ID/Phone is required");
      return;
    }
    
    // Use the exact string as requested by the user (no trimming/cleaning here)
    const target = phone.trim();
    setOpeningChatId(target);
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Find the contact or group to get the message/name
      const contact = contacts.find(c => c.phone === phone);
      const group = groups.find(g => g.id === phone);
      
      const targetName = name || contact?.name || group?.subject || "";
      const message = sendDraft ? (contact ? parseTemplate(contact.message_template, contact) : settings.defaultTemplate) : "";

      chrome.runtime.sendMessage({ 
        action: "OPEN_CHAT", 
        phone: target,
        name: targetName,
        message: message,
        attachment: sendDraft ? settings.attachment : null,
        sendImmediately: sendDraft,
        useDirectMethod: true // Signal to use WPP.chat.open or similar
      }, (response) => {
        setOpeningChatId(null);
        if (response && !response.success) {
          toast.error(response.error || "Failed to open chat");
        } else {
          toast.success(sendDraft ? "Message sent successfully" : "Chat opened successfully");
        }
      });
    } else {
      // Fallback for direct execution if script is injected
      try {
        // @ts-ignore
        if (window.WPP && window.WPP.chat) {
          // @ts-ignore
          window.WPP.chat.open(target);
          toast.success("Chat opened successfully");
        } else {
          toast.info("Direct opening requires the extension context.");
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to execute direct open command");
      }
      setOpeningChatId(null);
    }
  };

  /**
   * Handles CSV/XLS file import and parses it into the contact list.
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      const newContacts: Contact[] = data.map((row: any, idx: number) => ({
        id: crypto.randomUUID(),
        sr_no: (contacts.length + idx + 1).toString(),
        name: row.Name || row.name || "",
        phone: (row.Phone || row.phone || row['Mobile Number'] || "").toString().trim(),
        message_template: row.Message || row.message || row['Message Template'] || settings.defaultTemplate,
        status: 'pending'
      }));

      setContacts([...contacts, ...newContacts]);
      toast.success(`Imported ${newContacts.length} contacts`);
    };
    reader.readAsBinaryString(file);
  };

  /**
   * Adds a new empty row to the contact list.
   */
  const addRow = () => {
    const newContact: Contact = {
      id: crypto.randomUUID(),
      sr_no: (contacts.length + 1).toString(),
      name: "",
      phone: "",
      message_template: settings.defaultTemplate,
      status: 'pending'
    };
    setContacts([...contacts, newContact]);
  };

  /**
   * Updates a specific field for a contact.
   */
  const updateContact = (id: string, field: keyof Contact, value: any) => {
    setContacts(contacts.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  /**
   * Handles file attachment for a specific contact.
   */
  const handleFileAttach = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      updateContact(id, 'attachment', { name: file.name, dataUrl });
      toast.success(`Attached ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const parseTemplate = (template: string, contact: Contact) => {
    return template
      .replace(/{{name}}/g, contact.name)
      .replace(/{{mobile}}/g, contact.phone)
      .replace(/{{sr_no}}/g, contact.sr_no);
  };

  const withConnection = (callback: () => void) => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "CHECK_CONNECTION" }, (res) => {
        if (res && res.success) {
          callback();
        } else {
          toast.error(res?.error || "Could not connect to WhatsApp. Make sure it's open and loaded.");
          setIsScraping(false);
        }
      });
    }
  };

  const fetchGroups = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      setIsScraping(true);
      withConnection(() => {
        chrome.runtime.sendMessage({ action: "GET_GROUPS" }, (response) => {
          setIsScraping(false);
          if (response && response.success) {
            setGroups(response.groups);
            toast.success(`Loaded ${response.groups.length} groups`);
          } else {
            toast.error(response?.error || "Failed to load groups");
          }
        });
      });
    }
  };

  const fetchContactsFromSidebar = (filterType: string = 'all_contacts') => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      setIsScraping(true);
      withConnection(() => {
        chrome.runtime.sendMessage({ 
          action: "FETCH_CONTACTS",
          filter: { primary: filterType }
        }, (response) => {
          setIsScraping(false);
          if (response && response.success) {
            const newContacts: Contact[] = response.data.map((c: any, idx: number) => ({
              id: crypto.randomUUID(),
              sr_no: (contacts.length + idx + 1).toString(),
              name: c.name || "Unknown",
              phone: c.phone || "",
              message_template: settings.defaultTemplate,
              status: 'pending'
            }));
            setContacts([...contacts, ...newContacts]);
            toast.success(`Fetched ${newContacts.length} contacts from sidebar`);
          } else {
            toast.error(response?.error || "Failed to fetch contacts");
          }
        });
      });
    }
  };

  const scrapeGroupMembers = (groupId: string, groupName: string, autoDownload: boolean = false) => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      setIsScraping(true);
      withConnection(() => {
        // Use the fast IndexedDB-based scraping
        chrome.runtime.sendMessage({ 
          action: "FETCH_CONTACTS",
          filter: { primary: 'group', secondary: groupId }
        }, (response) => {
          setIsScraping(false);
          if (response && response.success) {
            const newContacts: Contact[] = response.data.map((c: any, idx: number) => ({
              id: crypto.randomUUID(),
              sr_no: (contacts.length + idx + 1).toString(),
              name: c.name || "Unknown",
              phone: c.phone || "",
              message_template: settings.defaultTemplate,
              status: 'pending'
            }));
            
            if (autoDownload) {
              downloadDataAsCSV(newContacts, `members_${groupName.replace(/\s+/g, '_')}`);
            } else {
              setContacts(prev => [...prev, ...newContacts]);
            }
            toast.success(`Scraped ${response.data.length} members from ${groupName} (Fast)`);
          } else {
            // Fallback to the UI-based scraping if IndexedDB fails or is empty
            setIsScraping(true);
            chrome.runtime.sendMessage({ 
              action: "SCRAPE_GROUP",
              groupName: groupName
            }, (fallbackRes) => {
              setIsScraping(false);
              if (fallbackRes && fallbackRes.success) {
                const newContacts: Contact[] = fallbackRes.data.map((c: any, idx: number) => ({
                  id: crypto.randomUUID(),
                  sr_no: (contacts.length + idx + 1).toString(),
                  name: c.name || "Unknown",
                  phone: c.phone || "",
                  message_template: settings.defaultTemplate,
                  status: 'pending'
                }));
                
                if (autoDownload) {
                  downloadDataAsCSV(newContacts, `members_${groupName.replace(/\s+/g, '_')}`);
                } else {
                  setContacts(prev => [...prev, ...newContacts]);
                }
                toast.success(`Scraped ${fallbackRes.data.length} members from ${groupName} (UI Scrape)`);
              } else {
                toast.error(fallbackRes?.error || "Failed to scrape group. Make sure the group is open.");
              }
            });
          }
        });
      });
    }
  };

  const startGroupCampaign = () => {
    if (selectedGroups.length === 0) {
      toast.error("Please select at least one group");
      return;
    }

    const groupContacts: Contact[] = selectedGroups.map((groupId, idx) => {
      const group = groups.find(g => g.id === groupId);
      return {
        id: crypto.randomUUID(),
        sr_no: (contacts.length + idx + 1).toString(),
        name: group?.subject || "Unknown Group",
        phone: group?.id || group?.subject || "", // Prefer ID for direct open
        message_template: settings.defaultTemplate,
        attachment: settings.attachment, // Include campaign attachment
        status: 'pending'
      };
    });

    setContacts(prev => [...prev, ...groupContacts]);

    const preparedContacts = groupContacts.map(c => ({
      ...c,
      message: parseTemplate(c.message_template, c)
    }));

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ 
        action: "start_queue", 
        contacts: preparedContacts,
        settings: {
          ...settings,
          useDirectOpen: settings.useDirectOpen // Ensure this is passed
        }
      }, (response) => {
        setQueueStatus('running');
        toast.success("Group campaign started");
        setActiveTab('contacts'); // Switch to contacts tab to see progress
      });
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId) 
        : [...prev, groupId]
    );
  };

  const selectAllGroups = () => {
    if (selectedGroups.length === groups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(groups.map(g => g.id));
    }
  };

  /**
   * Starts the automation queue by sending contacts to the background script.
   */
  const startQueue = () => {
    const pendingContacts = contacts.filter(c => c.status !== 'sent');
    
    if (pendingContacts.length === 0) {
      toast.error("No pending contacts to send");
      return;
    }

    const preparedContacts = pendingContacts.map(c => ({
      ...c,
      message: parseTemplate(c.message_template, c)
    }));

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ 
        action: "start_queue", 
        contacts: preparedContacts,
        settings: {
          ...settings,
          useDirectOpen: settings.useDirectOpen // Ensure this is passed
        }
      }, (response) => {
        setQueueStatus('running');
        toast.success("Automation started");
      });
    } else {
      toast.info("Extension context required for automation. Please load as unpacked extension.");
    }
  };

  const pauseQueue = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "pause_queue" }, () => {
        setQueueStatus('paused');
      });
    }
  };

  const resumeQueue = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "resume_queue" }, () => {
        setQueueStatus('running');
      });
    }
  };

  const stopQueue = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "stop_queue" }, () => {
        setQueueStatus('stopped');
        setCurrentIndex(-1);
      });
    }
  };

  /**
   * Downloads data as a CSV file.
   */
  const downloadDataAsCSV = (dataToDownload: any[], filenamePrefix: string = 'whatsapp_automation') => {
    if (dataToDownload.length === 0) {
      toast.error("No data to download");
      return;
    }
    
    const safePrefix = (filenamePrefix || 'whatsapp_automation').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    const data = dataToDownload.map(c => ({
      'Sr. No': c.sr_no,
      'Name': c.name,
      'Phone': c.phone,
      'Message Template': c.message_template || '',
      'Status': c.status || 'pending',
      'Error': c.error || ''
    }));

    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safePrefix}_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${dataToDownload.length} items`);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to generate CSV file");
    }
  };

  /**
   * Downloads the current contact list as a CSV file.
   */
  const downloadCSV = () => {
    downloadDataAsCSV(contacts);
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    toast.success("Settings reset to defaults");
  };

  const clearContacts = () => {
    if (window.confirm("Are you sure you want to clear all contacts?")) {
      setContacts([]);
      toast.success("Contacts cleared");
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-green-600" />
              WhatsApp Automation
            </h1>
            <p className="text-slate-500 mt-1">Bulk messaging with DOM-based automation.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".csv,.xlsx,.xls" 
              className="hidden" 
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Import CSV/XLS
            </Button>
            
            <Button variant="outline" onClick={downloadCSV} className="gap-2">
              <Download className="w-4 h-4" />
              Download CSV
            </Button>

            <div className="h-8 w-px bg-slate-200 mx-2" />
            
            {queueStatus === 'idle' || queueStatus === 'stopped' ? (
              <Button onClick={startQueue} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                <Play className="w-4 h-4" />
                Start
              </Button>
            ) : queueStatus === 'running' ? (
              <Button onClick={pauseQueue} variant="secondary" className="gap-2">
                <Pause className="w-4 h-4" />
                Pause
              </Button>
            ) : (
              <Button onClick={resumeQueue} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                <Play className="w-4 h-4" />
                Resume
              </Button>
            )}
            
            <Button 
              onClick={stopQueue} 
              variant="destructive" 
              className="gap-2"
              disabled={queueStatus === 'idle'}
            >
              <Square className="w-4 h-4" />
              Stop
            </Button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('contacts')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'contacts' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Contacts Queue
          </button>
          <button 
            onClick={() => setActiveTab('groups')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'groups' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Group Campaign
          </button>
          <button 
            onClick={() => setActiveTab('scraping')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'scraping' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Scraping Tools
          </button>
        </div>

        {activeTab === 'contacts' && (
          <>
            {/* Progress & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-bold text-slate-400">Total</CardDescription>
                  <CardTitle className="text-2xl">{contacts.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-bold text-slate-400">Sent</CardDescription>
                  <CardTitle className="text-2xl text-green-600">
                    {contacts.filter(c => c.status === 'sent').length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-bold text-slate-400">Pending</CardDescription>
                  <CardTitle className="text-2xl text-amber-500">
                    {contacts.filter(c => c.status === 'pending').length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-bold text-slate-400">Status</CardDescription>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    {queueStatus === 'running' && <RefreshCw className="w-5 h-5 animate-spin text-green-600" />}
                    <span className="capitalize">{queueStatus}</span>
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Main Table Card */}
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-white border-b">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-lg font-semibold">Message Queue</CardTitle>
                    <Button variant="ghost" size="sm" onClick={addRow} className="text-green-600 hover:text-green-700 hover:bg-green-50 gap-1">
                      <Plus className="w-4 h-4" />
                      Add Row
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setContacts(contacts.map(c => ({ ...c, status: 'pending', error: undefined })));
                      toast.success("All statuses cleared");
                    }} className="text-slate-500 hover:text-slate-700 gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Clear Status
                    </Button>
                    <Button variant="ghost" size="sm" onClick={downloadCSV} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1">
                      <Download className="w-4 h-4" />
                      Download CSV
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearContacts} className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1">
                      <Trash2 className="w-3 h-3" />
                      Clear All
                    </Button>
                  </div>
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="Search by name or phone..." 
                      className="pl-10" 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead className="w-16">Sr.</TableHead>
                        <TableHead className="w-48">Name</TableHead>
                        <TableHead className="w-48">Mobile Number</TableHead>
                        <TableHead>Message Template</TableHead>
                        <TableHead className="w-40">Attachment</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence mode="popLayout">
                        {filteredContacts.map((contact, idx) => (
                          <motion.tr
                            key={contact.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`group transition-colors ${currentIndex === idx ? 'bg-green-50/50' : 'hover:bg-slate-50/50'}`}
                          >
                            <TableCell className="font-mono text-xs text-slate-400">
                              {contact.sr_no}
                            </TableCell>
                            <TableCell>
                              <Input 
                                value={contact.name} 
                                onChange={(e) => updateContact(contact.id, 'name', e.target.value)}
                                className="h-8 border-transparent hover:border-slate-200 focus:border-slate-300 bg-transparent"
                                placeholder="Name"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input 
                                  value={contact.phone} 
                                  onChange={(e) => updateContact(contact.id, 'phone', e.target.value)}
                                  className="h-8 border-transparent hover:border-slate-200 focus:border-slate-300 bg-transparent font-mono"
                                  placeholder="Phone"
                                />
                                {contact.phone.length >= 10 ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 text-slate-300 shrink-0" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input 
                                value={contact.message_template} 
                                onChange={(e) => updateContact(contact.id, 'message_template', e.target.value)}
                                className="h-8 border-transparent hover:border-slate-200 focus:border-slate-300 bg-transparent text-sm"
                                placeholder="Message..."
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {contact.attachment ? (
                                  <div className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded border">
                                    <FileText className="w-3 h-3 text-slate-400" />
                                    <span className="truncate max-w-[80px]">{contact.attachment.name}</span>
                                    <button onClick={() => updateContact(contact.id, 'attachment', undefined)}>
                                      <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="cursor-pointer text-slate-400 hover:text-slate-600">
                                    <Paperclip className="w-4 h-4" />
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      onChange={(e) => handleFileAttach(contact.id, e)}
                                    />
                                  </label>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wider w-fit ${
                                  contact.status === 'read' ? 'bg-blue-100 text-blue-700' :
                                  contact.status === 'delivered' ? 'bg-indigo-100 text-indigo-700' :
                                  contact.status === 'sent' ? 'bg-green-100 text-green-700' :
                                  contact.status === 'failed' ? 'bg-red-100 text-red-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {contact.status}
                                </span>
                                {contact.error && (
                                  <span className="text-[10px] text-red-500 mt-1 truncate max-w-[100px]" title={contact.error}>
                                    {contact.error}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-600"
                                  onClick={() => openDirectChat(contact.phone)}
                                  title="Direct Open Chat"
                                  disabled={openingChatId === contact.phone}
                                >
                                  {openingChatId === contact.phone ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <ExternalLink className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="opacity-0 group-hover:opacity-100 text-green-500 hover:text-green-600"
                                  onClick={() => openDirectChat(contact.phone, true, contact.name)}
                                  title="Send Drafted Message"
                                  disabled={openingChatId === contact.phone}
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                                  onClick={() => setContacts(contacts.filter(c => c.id !== contact.id))}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'groups' && (
          <div className="space-y-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  Campaign Settings
                </CardTitle>
                <CardDescription>Configure the message and attachment for this campaign.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="campaign-msg">Default Message Template</Label>
                    <Textarea 
                      id="campaign-msg"
                      placeholder="Type your message here... Use {{name}} for personalization."
                      value={settings.defaultTemplate}
                      onChange={(e) => setSettings(prev => ({ ...prev, defaultTemplate: e.target.value }))}
                      className="min-h-[100px] resize-y"
                    />
                    <p className="text-[10px] text-slate-400 italic">
                      Placeholders: {"{{name}}"}, {"{{phone}}"}, {"{{sr_no}}"}
                    </p>
                  </div>
                  
                  <div className="w-full md:w-80 space-y-4 flex flex-col justify-between">
                    <div className="space-y-2">
                      <Label className="block">Campaign Attachment</Label>
                      {settings.attachment ? (
                        <div className="flex items-center justify-between p-2 bg-slate-50 border rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-medium truncate max-w-[150px]">{settings.attachment.name}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSettings(prev => ({ ...prev, attachment: undefined }))}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.onchange = (e: any) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                setSettings(prev => ({
                                  ...prev,
                                  attachment: {
                                    name: file.name,
                                    dataUrl: evt.target?.result as string
                                  }
                                }));
                                toast.success("Attachment added to campaign");
                              };
                              reader.readAsDataURL(file);
                            };
                            input.click();
                          }}
                          className="w-full border-dashed border-2 h-12 hover:bg-slate-50 hover:border-slate-300"
                        >
                          <Paperclip className="w-4 h-4 mr-2" />
                          Attach File
                        </Button>
                      )}
                    </div>
                    
                    <Button onClick={startGroupCampaign} className="bg-green-600 hover:bg-green-700 text-white h-12 w-full">
                      <Play className="w-4 h-4 mr-2" />
                      Start Campaign
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-xl font-bold">Select Target Groups</h2>
                <p className="text-xs text-slate-500">Choose which groups will receive the message above.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchGroups} disabled={isScraping}>
                  {isScraping ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Refresh Groups
                </Button>
              </div>
            </div>

            <Card className="border-none shadow-sm">
              <CardHeader className="border-b">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-lg">Select Groups ({selectedGroups.length} selected)</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => {
                      const filteredIds = filteredGroups.map(g => g.id);
                      const allFilteredSelected = filteredIds.every(id => selectedGroups.includes(id));
                      
                      if (allFilteredSelected) {
                        setSelectedGroups(prev => prev.filter(id => !filteredIds.includes(id)));
                      } else {
                        setSelectedGroups(prev => Array.from(new Set([...prev, ...filteredIds])));
                      }
                    }}>
                      {filteredGroups.every(g => selectedGroups.includes(g.id)) ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="Search groups..." 
                      className="pl-10" 
                      value={groupSearchTerm}
                      onChange={(e) => setGroupSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Group Name</TableHead>
                        <TableHead className="w-32 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGroups.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-slate-500">
                            {groupSearchTerm ? "No groups match your search." : "No groups found. Click \"Refresh Groups\" to load them."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredGroups.map((group) => (
                          <TableRow key={group.id} className="hover:bg-slate-50">
                            <TableCell>
                              <input 
                                type="checkbox" 
                                checked={selectedGroups.includes(group.id)}
                                onChange={() => toggleGroupSelection(group.id)}
                                className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{group.subject}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => openDirectChat(group.id, false, group.subject)}
                                  className="text-slate-600 border-slate-200 hover:bg-slate-50"
                                  title="Open Group Chat"
                                  disabled={openingChatId === group.id}
                                >
                                  {openingChatId === group.id ? (
                                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                  ) : (
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                  )}
                                  Open
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => openDirectChat(group.id, true, group.subject)}
                                  className="text-green-600 border-green-200 hover:bg-green-50"
                                  title="Send Drafted Message"
                                  disabled={openingChatId === group.id}
                                >
                                  <Send className="w-3 h-3 mr-1" />
                                  Send
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => scrapeGroupMembers(group.id, group.subject)}
                                  disabled={isScraping}
                                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  <Users className="w-3 h-3 mr-1" />
                                  Scrape
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => scrapeGroupMembers(group.id, group.subject, true)}
                                  disabled={isScraping}
                                  className="text-green-600 border-green-200 hover:bg-green-50"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Scrape & Download
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'scraping' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Sidebar Scraper
                </CardTitle>
                <CardDescription>
                  Quickly extract all contacts currently visible in your WhatsApp sidebar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => fetchContactsFromSidebar('all_contacts')} disabled={isScraping}>
                    All Contacts
                  </Button>
                  <Button variant="outline" onClick={() => fetchContactsFromSidebar('unread_chats')} disabled={isScraping}>
                    Unread Chats
                  </Button>
                  <Button variant="outline" onClick={() => fetchContactsFromSidebar('group')} disabled={isScraping}>
                    All Groups
                  </Button>
                  <Button variant="outline" onClick={() => {
                    if (typeof chrome !== 'undefined' && chrome.runtime) {
                      setIsScraping(true);
                      withConnection(() => {
                        chrome.runtime.sendMessage({ action: "GET_CHAT_SNAPSHOT" }, (response) => {
                          setIsScraping(false);
                          if (response && response.success) {
                            toast.success("Chat snapshot captured");
                            // You might want to do something with the snapshot data here
                          } else {
                            toast.error(response?.error || "Failed to get chat snapshot");
                          }
                        });
                      });
                    }
                  }} disabled={isScraping}>
                    Chat Snapshot
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Note: This only scrapes what is currently loaded in the sidebar. Scroll down in WhatsApp to load more.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-green-600" />
                  Manual Scraper
                </CardTitle>
                <CardDescription>
                  Scrape members from the currently open group in WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white" 
                    onClick={() => scrapeGroupMembers("", "")}
                    disabled={isScraping}
                  >
                    {isScraping ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Scrape Open Group
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full border-green-200 text-green-700 hover:bg-green-50" 
                    onClick={() => scrapeGroupMembers("", "", true)}
                    disabled={isScraping}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Scrape & Download CSV
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Open a group in WhatsApp, click the group name to see info, then click "View all" members before using this.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Settings & Help */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-none shadow-sm md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                Automation Settings
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetSettings} className="h-8 text-xs gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Reset Defaults
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  setContacts(contacts.map(c => ({ ...c, status: 'pending', error: undefined })));
                  toast.success("Statuses cleared");
                }} className="h-8 text-xs gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Clear Status
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold text-slate-500">Contact Interval (ms)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Min</Label>
                        <Input 
                          type="number" 
                          value={settings.minDelay} 
                          onChange={(e) => setSettings({...settings, minDelay: parseInt(e.target.value)})}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Max</Label>
                        <Input 
                          type="number" 
                          value={settings.maxDelay} 
                          onChange={(e) => setSettings({...settings, maxDelay: parseInt(e.target.value)})}
                          className="h-8"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="randomDelay"
                      checked={settings.randomDelay}
                      onChange={(e) => setSettings({...settings, randomDelay: e.target.checked})}
                    />
                    <Label htmlFor="randomDelay" className="text-sm">Randomize Interval</Label>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                    <input 
                      type="checkbox" 
                      id="useSmartWait"
                      checked={settings.useSmartWait}
                      onChange={(e) => setSettings({...settings, useSmartWait: e.target.checked})}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="useSmartWait" className="text-sm font-bold">Smart Wait (Recommended)</Label>
                      <p className="text-[10px] text-slate-500 leading-tight">Proceed immediately when elements appear instead of fixed delays.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-100">
                    <input 
                      type="checkbox" 
                      id="useDirectOpen"
                      checked={settings.useDirectOpen}
                      onChange={(e) => setSettings({...settings, useDirectOpen: e.target.checked})}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="useDirectOpen" className="text-sm font-bold text-green-700">Direct Open Mode</Label>
                      <p className="text-[10px] text-green-600 leading-tight">Skip search and open chats directly using internal commands.</p>
                    </div>
                  </div>
                  
                  <div className="grid gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                    <Label className="text-xs font-bold text-blue-700 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Auto Start Time
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        type="datetime-local" 
                        value={settings.autoStartTime || ""} 
                        onChange={(e) => setSettings({...settings, autoStartTime: e.target.value})}
                        className="h-8 bg-white flex-1"
                      />
                      <Button 
                        size="sm" 
                        variant={settings.autoStartEnabled ? "destructive" : "default"}
                        className="h-8 px-3"
                        onClick={() => setSettings(prev => ({ ...prev, autoStartEnabled: !prev.autoStartEnabled }))}
                      >
                        {settings.autoStartEnabled ? "Stop" : "Start"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-blue-600">
                      {settings.autoStartEnabled ? "Auto-start is ACTIVE" : "Automation will start automatically at this time if enabled."}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Search Delay (ms)</Label>
                      <Input 
                        type="number" 
                        value={settings.searchDelay} 
                        onChange={(e) => setSettings({...settings, searchDelay: parseInt(e.target.value)})}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Open Chat Delay (ms)</Label>
                      <Input 
                        type="number" 
                        value={settings.openChatDelay} 
                        onChange={(e) => setSettings({...settings, openChatDelay: parseInt(e.target.value)})}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Paste Delay (ms)</Label>
                      <Input 
                        type="number" 
                        value={settings.pasteDelay} 
                        onChange={(e) => setSettings({...settings, pasteDelay: parseInt(e.target.value)})}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Send Delay (ms)</Label>
                      <Input 
                        type="number" 
                        value={settings.sendDelay} 
                        onChange={(e) => setSettings({...settings, sendDelay: parseInt(e.target.value)})}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold text-slate-500">Max Retries</Label>
                    <Input 
                      type="number" 
                      value={settings.maxRetries} 
                      onChange={(e) => setSettings({...settings, maxRetries: parseInt(e.target.value)})}
                      className="h-8"
                    />
                  </div>
                  <div className="grid gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                    <Label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      Global Attachment
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="file" 
                        className="h-8 text-[10px]" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setSettings(prev => ({
                                ...prev,
                                attachment: {
                                  name: file.name,
                                  dataUrl: ev.target?.result as string
                                }
                              }));
                              toast.success("Global attachment set");
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      {settings.attachment && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-red-500"
                          onClick={() => setSettings(prev => ({ ...prev, attachment: undefined }))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {settings.attachment && (
                      <p className="text-[10px] text-slate-500 truncate">
                        Selected: {settings.attachment.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="grid gap-2 pt-4 border-t">
                <Label className="text-xs font-bold text-slate-500">Default Message Template</Label>
                <Textarea 
                  value={settings.defaultTemplate} 
                  onChange={(e) => setSettings({...settings, defaultTemplate: e.target.value})}
                  className="text-xs min-h-[80px]"
                  placeholder="Hello {{name}}..."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-slate-900 text-white">
            <CardHeader>
              <CardTitle className="text-lg">Template Help</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300">
              <p>Use these placeholders in your message template:</p>
              <ul className="space-y-2 font-mono text-xs">
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>{"{{name}}"}</span>
                  <span className="text-slate-500">Contact Name</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>{"{{mobile}}"}</span>
                  <span className="text-slate-500">Phone Number</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>{"{{sr_no}}"}</span>
                  <span className="text-slate-500">Serial Number</span>
                </li>
              </ul>
              <div className="pt-4 border-t border-slate-800">
                <p className="text-xs text-amber-400 font-bold uppercase tracking-wider mb-2">Safety Note</p>
                <p className="text-xs leading-relaxed">
                  Keep one WhatsApp Web tab open. Do not navigate away while running. Use conservative delays.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}


