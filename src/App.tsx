/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Settings, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Cpu, 
  ChevronRight, 
  ChevronLeft,
  Terminal,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Search,
  Download,
  ExternalLink,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Toaster, toast } from 'sonner';
import { cn } from './lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

interface RunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: any;
  expires_at: string;
  size_vram: number;
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('ollama_chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'chat' | 'models' | 'pull'>('chat');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pullingModel, setPullingModel] = useState<{ name: string; progress: number; status: string } | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('ollama_url') || 'http://localhost:11434');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('ollama_selected_model') || '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [newModelName, setNewModelName] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  const popularModels = [
    { name: 'llama3.2', description: 'Meta\'s latest lightweight model' },
    { name: 'llama3.1', description: 'Meta\'s most capable open model' },
    { name: 'mistral', description: 'High performance 7B model' },
    { name: 'phi3', description: 'Microsoft\'s efficient small model' },
    { name: 'gemma2', description: 'Google\'s lightweight open model' },
    { name: 'qwen2.5', description: 'Alibaba\'s powerful language model' },
    { name: 'deepseek-v2', description: 'Strong reasoning and coding model' },
    { name: 'codellama', description: 'Specialized for code generation' },
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pullAbortController = useRef<AbortController | null>(null);

  const activeChat = chats.find(c => c.id === activeChatId);

  useEffect(() => {
    localStorage.setItem('ollama_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('ollama_url', ollamaUrl);
    checkConnection();
  }, [ollamaUrl]);

  useEffect(() => {
    localStorage.setItem('ollama_selected_model', selectedModel);
  }, [selectedModel]);

  // Poll for running models every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (connectionStatus === 'connected') {
        fetchRunningModels();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [connectionStatus, ollamaUrl]);

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkConnection = async () => {
    setConnectionStatus('checking');
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const fetchedModels = data.models || [];
        setModels(fetchedModels);
        
        // If no model is selected but we have models, select the first one
        if (fetchedModels.length > 0 && !selectedModel) {
          setSelectedModel(fetchedModels[0].name);
        }
        
        setConnectionStatus('connected');
        fetchRunningModels();
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      console.error('Connection error:', error);
      setConnectionStatus('disconnected');
    }
  };

  const fetchRunningModels = async () => {
    try {
      const response = await fetch(`${ollamaUrl}/api/ps`);
      if (response.ok) {
        const data = await response.json();
        setRunningModels(data.models || []);
      }
    } catch (error) {
      // Silently fail for background polling
    }
  };

  const pullModel = async () => {
    if (!newModelName.trim()) return;
    
    const modelName = newModelName.trim();
    setPullingModel({ name: modelName, progress: 0, status: 'Starting...' });
    setNewModelName('');

    pullAbortController.current = new AbortController();

    try {
      const response = await fetch(`${ollamaUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
        signal: pullAbortController.current.signal,
      });

      if (!response.ok) throw new Error('Failed to pull model');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.status) {
              const progress = json.completed && json.total ? (json.completed / json.total) * 100 : 0;
              setPullingModel(prev => prev ? { ...prev, status: json.status, progress } : null);
            }
          } catch (e) {
            console.error('Error parsing pull chunk', e);
          }
        }
      }
      toast.success(`Model ${modelName} pulled successfully!`);
      checkConnection();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.info(`Pulling ${modelName} cancelled`);
      } else {
        toast.error(`Failed to pull model ${modelName}`);
        console.error(error);
      }
    } finally {
      setPullingModel(null);
      pullAbortController.current = null;
    }
  };

  const cancelPull = () => {
    if (pullAbortController.current) {
      pullAbortController.current.abort();
    }
  };

  const deleteModel = async (name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      const response = await fetch(`${ollamaUrl}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        toast.success(`Model ${name} deleted`);
        if (selectedModel === name) setSelectedModel('');
        checkConnection();
      } else {
        throw new Error('Failed to delete model');
      }
    } catch (error) {
      toast.error(`Error deleting model ${name}`);
    }
  };

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      model: selectedModel,
      createdAt: Date.now(),
    };
    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);
    setCurrentView('chat');
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChats(chats.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
    }
    toast.success('Chat deleted');
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || !selectedModel) return;

    let currentChatId = activeChatId;
    if (!currentChatId) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: input.slice(0, 30) + (input.length > 30 ? '...' : ''),
        messages: [],
        model: selectedModel,
        createdAt: Date.now(),
      };
      setChats([newChat, ...chats]);
      currentChatId = newChat.id;
      setActiveChatId(newChat.id);
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setChats(prev => prev.map(c => 
      c.id === currentChatId 
        ? { ...c, messages: [...c.messages, userMessage], title: c.messages.length === 0 ? input.slice(0, 30) : c.title }
        : c
    ));
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            ...(chats.find(c => c.id === currentChatId)?.messages || []).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: input }
          ],
          stream: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to connect to Ollama');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setChats(prev => prev.map(c => 
        c.id === currentChatId 
          ? { ...c, messages: [...c.messages, assistantMessage] }
          : c
      ));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              assistantContent += json.message.content;
              setChats(prev => prev.map(c => 
                c.id === currentChatId 
                  ? { 
                      ...c, 
                      messages: c.messages.map((m, idx) => 
                        idx === c.messages.length - 1 ? { ...m, content: assistantContent } : m
                      ) 
                    }
                  : c
              ));
            }
          } catch (e) {
            console.error('Error parsing chunk', e);
          }
        }
      }
    } catch (error) {
      toast.error('Error: Could not connect to Ollama. Make sure it is running and OLLAMA_ORIGINS is set.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f5f5f5]">
      <Toaster position="top-center" />
      
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="bg-white border-r border-gray-200 flex flex-col overflow-hidden"
      >
        <div className="p-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <Terminal size={20} className="text-blue-600" />
            <span>Ollama UI</span>
          </div>
          <button 
            onClick={createNewChat}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            title="New Chat"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No chats yet
            </div>
          ) : (
            chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm transition-all group",
                  activeChatId === chat.id 
                    ? "bg-blue-50 text-blue-700 font-medium" 
                    : "hover:bg-gray-50 text-gray-600"
                )}
              >
                <MessageSquare size={16} className={activeChatId === chat.id ? "text-blue-500" : "text-gray-400"} />
                <span className="flex-1 truncate">{chat.title}</span>
                <button 
                  onClick={(e) => deleteChat(chat.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-100 space-y-3">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-gray-500">Status</span>
            <div className="flex items-center gap-1.5">
              {connectionStatus === 'connected' ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-green-600 font-medium">Online</span>
                </>
              ) : connectionStatus === 'disconnected' ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-red-600 font-medium">Offline</span>
                </>
              ) : (
                <>
                  <RefreshCw size={12} className="animate-spin text-gray-400" />
                  <span className="text-gray-400">Checking...</span>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setCurrentView('chat')}
              className={cn(
                "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
                currentView === 'chat' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
              )}
            >
              <MessageSquare size={16} />
              <span>Chat</span>
            </button>
            <button 
              onClick={() => setCurrentView('models')}
              className={cn(
                "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
                currentView === 'models' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
              )}
            >
              <Cpu size={16} />
              <span>Models</span>
            </button>
            <button 
              onClick={() => setCurrentView('pull')}
              className={cn(
                "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
                currentView === 'pull' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
              )}
            >
              <Download size={16} />
              <span>Pull</span>
            </button>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg text-sm text-gray-600 transition-colors"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
            >
              {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
            <div className="h-4 w-[1px] bg-gray-200 mx-1" />
            {currentView === 'chat' ? (
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Model</span>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-transparent text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer"
                >
                  {models.length === 0 ? (
                    <option value="">No models found</option>
                  ) : (
                    <>
                      <optgroup label="Installed Models">
                        {models.map(m => {
                          const isRunning = runningModels.some(rm => rm.name === m.name || rm.model === m.name);
                          return (
                            <option key={m.name} value={m.name}>
                              {m.name} {isRunning ? ' (Running)' : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    </>
                  )}
                </select>
              </div>
            ) : currentView === 'models' ? (
              <span className="font-bold text-gray-800">Installed Models</span>
            ) : (
              <span className="font-bold text-gray-800">Pull New Models</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={checkConnection}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              title="Refresh Models"
            >
              <RefreshCw size={18} className={connectionStatus === 'checking' ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        {/* View Switcher */}
        <div className="flex-1 overflow-y-auto">
          {currentView === 'chat' ? (
            /* Chat Area */
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {!activeChatId ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                      <Cpu size={32} />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold text-gray-800">Ollama Local AI</h2>
                      <p className="text-gray-500">
                        Select a model and start a conversation. Your data stays on your machine.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 w-full">
                      <button 
                        onClick={createNewChat}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-200"
                      >
                        <Plus size={18} />
                        New Conversation
                      </button>
                    </div>
                    {connectionStatus === 'disconnected' && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-left">
                        <AlertCircle className="text-red-500 shrink-0" size={20} />
                        <div className="text-sm">
                          <p className="font-semibold text-red-800">Ollama is unreachable</p>
                          <p className="text-red-600 mt-1">
                            Make sure Ollama is running and CORS is enabled with:<br/>
                            <code className="bg-red-100 px-1 rounded">OLLAMA_ORIGINS="*" ollama serve</code>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto w-full space-y-6">
                    {activeChat?.messages.map((msg, i) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={i} 
                        className={cn(
                          "flex gap-4",
                          msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          msg.role === 'user' ? "bg-gray-800 text-white" : "bg-blue-100 text-blue-600"
                        )}>
                          {msg.role === 'user' ? 'U' : <Cpu size={16} />}
                        </div>
                        <div className={cn(
                          "max-w-[85%] p-4 rounded-2xl",
                          msg.role === 'user' 
                            ? "bg-blue-600 text-white rounded-tr-none" 
                            : "bg-white border border-gray-200 rounded-tl-none shadow-sm"
                        )}>
                          <div className={cn("markdown-body", msg.role === 'user' ? "text-white" : "text-gray-800")}>
                            <Markdown>{msg.content}</Markdown>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 animate-pulse">
                          <Cpu size={16} />
                        </div>
                        <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-none shadow-sm">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="p-4 md:p-6 bg-gradient-to-t from-[#f5f5f5] via-[#f5f5f5] to-transparent">
                <form 
                  onSubmit={handleSendMessage}
                  className="max-w-3xl mx-auto relative group"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={activeChatId ? "Ask anything..." : "Start a new chat first"}
                    disabled={!activeChatId || isLoading}
                    rows={1}
                    className="w-full bg-white border border-gray-200 rounded-2xl p-4 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading || !activeChatId}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-xl transition-all shadow-lg shadow-blue-200 disabled:shadow-none"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </div>
          ) : currentView === 'models' ? (
            /* Model Management Area */
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-gray-800">Installed Models</h2>
                  <p className="text-sm text-gray-500">Manage your locally downloaded models</p>
                </div>
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    placeholder="Search installed models..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {models.filter(m => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase())).length === 0 && connectionStatus === 'connected' && (
                  <div className="col-span-full py-20 text-center text-gray-400">
                    {modelSearchQuery ? `No models matching "${modelSearchQuery}"` : "No models installed yet."}
                  </div>
                )}
                {models
                  .filter(m => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                  .map(model => {
                    const isRunning = runningModels.some(rm => rm.name === model.name || rm.model === model.name);
                    return (
                      <div key={model.digest} className={cn(
                        "bg-white p-5 rounded-3xl border transition-all group relative",
                        isRunning ? "border-green-200 shadow-md shadow-green-50" : "border-gray-200 shadow-sm hover:shadow-md"
                      )}>
                        {isRunning && (
                          <div className="absolute top-4 right-12 flex items-center gap-1.5 bg-green-100 text-green-700 px-2 py-1 rounded-full text-[10px] font-bold animate-pulse">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            RUNNING
                          </div>
                        )}
                        <div className="flex items-start justify-between mb-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            isRunning ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"
                          )}>
                            <Cpu size={20} />
                          </div>
                          <button 
                            onClick={() => deleteModel(model.name)}
                            className="p-2 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <h3 className="font-bold text-gray-800 mb-1 truncate pr-16" title={model.name}>{model.name}</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                            {model.details.parameter_size || 'Unknown'}
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                            {model.details.quantization_level || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-400 pt-4 border-t border-gray-50">
                          <span>{formatSize(model.size)}</span>
                          <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                        </div>
                        <button 
                          onClick={() => {
                            setSelectedModel(model.name);
                            setCurrentView('chat');
                            if (!activeChatId) createNewChat();
                          }}
                          className="w-full mt-4 py-2 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-blue-100"
                        >
                          Select for Chat
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            /* Pull New Model Area */
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
              <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-gray-800">Pull New Model</h2>
                  <p className="text-gray-500">Enter a model name from the Ollama library to download it to your machine.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Download className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="text" 
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      placeholder="e.g. llama3.2, mistral, codellama..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <button 
                    onClick={pullModel}
                    disabled={!newModelName.trim() || !!pullingModel}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white px-8 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 disabled:shadow-none"
                  >
                    {pullingModel ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
                    {pullingModel ? 'Pulling...' : 'Pull Model'}
                  </button>
                </div>

                {pullingModel && (
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                          <RefreshCw size={20} className="animate-spin" />
                        </div>
                        <div>
                          <p className="font-bold text-blue-900">Downloading {pullingModel.name}</p>
                          <p className="text-xs text-blue-700">{pullingModel.status}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={cancelPull}
                          className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-100 rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5"
                        >
                          <X size={14} />
                          CANCEL
                        </button>
                        <span className="text-xl font-mono font-bold text-blue-600">{pullingModel.progress.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${pullingModel.progress}%` }}
                        className="h-full bg-blue-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-lg font-bold text-gray-800">Popular Models</h3>
                  <a 
                    href="https://ollama.com/library" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Browse Library <ExternalLink size={14} />
                  </a>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {popularModels.map(model => (
                    <button
                      key={model.name}
                      onClick={() => setNewModelName(model.name)}
                      className="bg-white p-5 rounded-3xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group"
                    >
                      <div className="w-10 h-10 bg-gray-50 group-hover:bg-blue-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors mb-4">
                        <Cpu size={20} />
                      </div>
                      <h4 className="font-bold text-gray-800 mb-1">{model.name}</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">{model.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-400 pb-4">
          Ollama Web UI v1.0 • Running on {ollamaUrl}
        </p>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
              >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-800">Settings</h3>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Ollama Server URL</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                        placeholder="http://localhost:11434"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {connectionStatus === 'connected' ? (
                          <CheckCircle2 size={16} className="text-green-500" />
                        ) : (
                          <AlertCircle size={16} className="text-red-500" />
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      Default is http://localhost:11434. Make sure Ollama is running.
                    </p>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-2xl space-y-2">
                    <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider">CORS Configuration</h4>
                    <p className="text-xs text-blue-700 leading-relaxed">
                      If you can't connect, you must set the OLLAMA_ORIGINS environment variable on your machine:
                    </p>
                    <div className="bg-blue-900 text-blue-50 p-2 rounded-lg text-[10px] font-mono overflow-x-auto">
                      export OLLAMA_ORIGINS="*" && ollama serve
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-gray-50 flex justify-end">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2.5 rounded-xl font-medium transition-all"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
