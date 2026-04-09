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
  FileText
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
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  error?: string;
}

interface AppSettings {
  minDelay: number;
  maxDelay: number;
  randomDelay: boolean;
  maxRetries: number;
  defaultTemplate: string;
}

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [queueStatus, setQueueStatus] = useState<'idle' | 'running' | 'paused' | 'stopped'>('idle');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [settings, setSettings] = useState<AppSettings>({
    minDelay: 3000,
    maxDelay: 10000,
    randomDelay: true,
    maxRetries: 3,
    defaultTemplate: "Hello {{name}}, this is a message for you."
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load state from chrome.storage or localStorage
  useEffect(() => {
    const loadData = async () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['contacts', 'settings']);
        if (result.contacts) setContacts(result.contacts);
        if (result.settings) setSettings(result.settings);
      } else {
        const savedContacts = localStorage.getItem('contacts');
        const savedSettings = localStorage.getItem('settings');
        if (savedContacts) setContacts(JSON.parse(savedContacts));
        if (savedSettings) setSettings(JSON.parse(savedSettings));
      }
    };
    loadData();

    // Listen for status updates from background
    const listener = (message: any) => {
      if (message.action === "status_update") {
        setQueueStatus(message.status);
        setCurrentIndex(message.currentIndex);
        if (message.error) toast.error(message.error);
        
        // Update local status if sent successfully
        if (message.currentIndex !== undefined) {
          setContacts(prev => prev.map((c, i) => {
            if (i < message.currentIndex) return { ...c, status: 'sent' };
            if (i === message.currentIndex && message.status === 'running') return { ...c, status: 'pending' };
            return c;
          }));
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
      chrome.storage.local.set({ contacts, settings });
    } else {
      localStorage.setItem('contacts', JSON.stringify(contacts));
      localStorage.setItem('settings', JSON.stringify(settings));
    }
  }, [contacts, settings]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
    );
  }, [contacts, searchTerm]);

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
        phone: (row.Phone || row.phone || row['Mobile Number'] || "").toString().replace(/\D/g, ''),
        message_template: row.Message || row.message || row['Message Template'] || settings.defaultTemplate,
        status: 'pending'
      }));

      setContacts([...contacts, ...newContacts]);
      toast.success(`Imported ${newContacts.length} contacts`);
    };
    reader.readAsBinaryString(file);
  };

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

  const updateContact = (id: string, field: keyof Contact, value: any) => {
    setContacts(contacts.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

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

  const startQueue = () => {
    if (contacts.length === 0) {
      toast.error("Add some contacts first");
      return;
    }

    const preparedContacts = contacts.map(c => ({
      ...c,
      message: parseTemplate(c.message_template, c)
    }));

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ 
        action: "start_queue", 
        contacts: preparedContacts,
        settings
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

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-green-600" />
              WhatsApp Automation Pro
            </h1>
            <p className="text-slate-500 mt-1">Professional bulk messaging with DOM-based automation.</p>
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
                          <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                            contact.status === 'sent' ? 'bg-green-100 text-green-700' :
                            contact.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {contact.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                            onClick={() => setContacts(contacts.filter(c => c.id !== contact.id))}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Settings & Help */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-none shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                Automation Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Min Delay (ms)</Label>
                  <Input 
                    type="number" 
                    value={settings.minDelay} 
                    onChange={(e) => setSettings({...settings, minDelay: parseInt(e.target.value)})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Max Delay (ms)</Label>
                  <Input 
                    type="number" 
                    value={settings.maxDelay} 
                    onChange={(e) => setSettings({...settings, maxDelay: parseInt(e.target.value)})}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="randomDelay"
                    checked={settings.randomDelay}
                    onChange={(e) => setSettings({...settings, randomDelay: e.target.checked})}
                  />
                  <Label htmlFor="randomDelay">Randomize Delay</Label>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Max Retries</Label>
                  <Input 
                    type="number" 
                    value={settings.maxRetries} 
                    onChange={(e) => setSettings({...settings, maxRetries: parseInt(e.target.value)})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Default Template</Label>
                  <Textarea 
                    value={settings.defaultTemplate} 
                    onChange={(e) => setSettings({...settings, defaultTemplate: e.target.value})}
                    className="text-xs"
                  />
                </div>
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


