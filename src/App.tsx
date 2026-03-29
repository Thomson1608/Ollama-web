/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { ModelsView } from './components/ModelsView';
import { PullView } from './components/PullView';
import { WorkspaceView } from './components/WorkspaceView';
import { SettingsView } from './components/SettingsView';
import { Chat, Message, OllamaModel, RunningModel, ViewType, ConnectionStatus, Memory, ToolCall } from './types';

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(`You are a world-class software engineer.
You have access to a workspace where you can read, write, and list files.

CRITICAL DIRECTIVE:
1. NEVER just output code blocks in the chat.
2. ALWAYS use the write_file tool to create or update files in the workspace.
3. The user wants to see the code directly in their workspace, not in the chat window.
4. If you are creating multiple files, use multiple <tool_call> tags in sequence.

Use the following tools to assist the user with coding tasks:

1. list_files: List all files in the workspace.
   Usage: <tool_call>{"tool": "list_files", "args": {}}</tool_call>

2. read_file: Read the content of a specific file.
   Usage: <tool_call>{"tool": "read_file", "args": {"name": "filename.txt"}}</tool_call>

3. write_file: Write content to a file (creates or overwrites).
   Usage: <tool_call>{"tool": "write_file", "args": {"name": "filename.txt", "content": "file content here"}}</tool_call>

4. delete_file: Delete a file from the workspace.
   Usage: <tool_call>{"tool": "delete_file", "args": {"name": "filename.txt"}}</tool_call>

When you write code, briefly explain your plan in the chat, then immediately use the <tool_call> tag(s). The files will appear in the workspace on the right side of the screen.`);
  const [memory, setMemory] = useState<Memory>({ facts: [] });
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('chat');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAiTypingGlobally, setIsAiTypingGlobally] = useState(false);
  const [pullingModel, setPullingModel] = useState<{ name: string; progress: number; status: string } | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('ollama_selected_model') || '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [newModelName, setNewModelName] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [workspaceRefreshTrigger, setWorkspaceRefreshTrigger] = useState(0);

  const allOllamaModels = [
    'llama3.2', 'llama3.1', 'llama3', 'llama2', 'mistral', 'mistral-nemo', 'mixtral',
    'phi3', 'phi3.5', 'gemma2', 'gemma', 'qwen2.5', 'qwen2', 'deepseek-v2', 'deepseek-coder',
    'codellama', 'llava', 'dolphin-mistral', 'dolphin-llama3', 'orca-mini', 'vicuna',
    'tinydolphin', 'openhermes', 'starcoder2', 'stable-code', 'medllama2', 'wizard-vicuna',
    'sqlcoder', 'nous-hermes2', 'stable-beluga', 'yarn-llama2', 'command-r', 'command-r-plus',
    'nomic-embed-text', 'mxbai-embed-large', 'all-minilm', 'snowflake-arctic-embed',
    'moondream', 'bakllava', 'tinyllama', 'stable-diffusion', 'stable-video-diffusion'
  ];

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
  const chatAbortController = useRef<AbortController | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastUserMessageRef = useRef<string>('');

  const activeChat = chats.find(c => c.id === activeChatId);

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync isAiTypingGlobally across tabs using localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ollama_is_loading') {
        const loading = e.newValue === 'true';
        setIsAiTypingGlobally(loading);
      }
    };
    window.addEventListener('storage', handleStorage);
    
    // Initial check
    const initialLoading = localStorage.getItem('ollama_is_loading') === 'true';
    setIsAiTypingGlobally(initialLoading);

    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Reset global loading on tab close if this tab was the one loading
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isLoading) {
        localStorage.setItem('ollama_is_loading', 'false');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isLoading]);

  // Socket.io initialization
  useEffect(() => {
    console.log('Socket.io: Initializing client...');
    // Use explicit path if needed, but usually default works
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.io: Connected to server with ID:', socket.id);
    });

    socket.on('chat:start', ({ chatId, userMessage, assistantMessage, model }) => {
      console.log('Socket.io: chat:start event received for chat:', chatId);
      
      // Sync typing status globally
      setIsAiTypingGlobally(true);
      localStorage.setItem('ollama_is_loading', 'true');

      setChats(prev => {
        const chat = prev.find(c => c.id === chatId);
        if (chat) {
          // Check if userMessage is already the last message (to avoid duplication for the requester)
          const lastMsg = chat.messages[chat.messages.length - 1];
          const alreadyHasUserMsg = lastMsg && lastMsg.role === 'user' && lastMsg.content === userMessage.content;
          
          // Check if assistant message already exists (to avoid duplication)
          const hasAssistantMsg = chat.messages.some(m => m.role === 'assistant' && m.timestamp === assistantMessage.timestamp);
          if (hasAssistantMsg) return prev;

          return prev.map(c => 
            c.id === chatId 
              ? { 
                  ...c, 
                  messages: alreadyHasUserMsg 
                    ? [...c.messages, assistantMessage] 
                    : [...c.messages, userMessage, assistantMessage] 
                }
              : c
          );
        } else {
          const newChat: Chat = {
            id: chatId,
            title: userMessage.content.slice(0, 30) + (userMessage.content.length > 30 ? '...' : ''),
            messages: [userMessage, assistantMessage],
            model: model,
            createdAt: Date.now(),
          };
          return [newChat, ...prev];
        }
      });
      setIsAiTypingGlobally(true);
    });

    socket.on('chat:chunk', ({ chatId, chunk }) => {
      setChats(prev => prev.map(c => 
        c.id === chatId 
          ? { 
              ...c, 
              messages: c.messages.map((m, idx) => 
                (m.role === 'assistant' && idx === c.messages.length - 1) 
                  ? { ...m, content: m.content + chunk } 
                  : m
              ) 
            }
          : c
      ));
    });

    socket.on('chat:end', ({ chatId, finalContent }) => {
      console.log('Socket.io: chat:end event received for chat:', chatId);
      setIsAiTypingGlobally(false);
      localStorage.setItem('ollama_is_loading', 'false');
      
      // Sync final content
      if (finalContent) {
        setChats(prev => prev.map(c => 
          c.id === chatId 
            ? { 
                ...c, 
                messages: c.messages.map((m, idx) => 
                  (m.role === 'assistant' && idx === c.messages.length - 1) 
                    ? { ...m, content: finalContent } 
                    : m
                ) 
              }
            : c
        ));
      }
    });

    socket.on('memory:updated', (updatedMemory) => {
      console.log('Socket.io: memory:updated event received');
      setMemory(updatedMemory);
    });

    socket.on('tool:result', ({ chatId, tool, result }) => {
      console.log(`Socket.io: tool:result event received (${tool}):`, result);
      toast.info(result, { id: `tool-${chatId}-${tool}` });
    });

    socket.on('workspace:updated', () => {
      console.log('Socket.io: workspace:updated event received');
      setWorkspaceRefreshTrigger(prev => prev + 1);
    });

    socket.on('ollama:pull:progress', (data) => {
      if (data.status) {
        const progress = data.completed && data.total ? (data.completed / data.total) * 100 : 0;
        setPullingModel({ name: data.name, status: data.status, progress });
        
        if (data.status === 'success') {
          toast.success(`Model ${data.name} pulled successfully!`);
          setPullingModel(null);
          checkConnection();
        }
      }
    });

    return () => {
      console.log('Socket.io: Disconnecting client...');
      socket.disconnect();
    };
  }, []);

  // Handle model switch during loading
  useEffect(() => {
    if (isLoading && selectedModel) {
      console.log('Model switched while loading. Aborting current chat and retrying with new model:', selectedModel);
      
      // Abort current chat
      if (chatAbortController.current) {
        chatAbortController.current.abort();
      }

      // Remove the incomplete assistant message from the active chat
      if (activeChatId) {
        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            const lastMsg = c.messages[c.messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              return { ...c, messages: c.messages.slice(0, -1) };
            }
          }
          return c;
        }));
      }

      // Re-send the last message
      if (lastUserMessageRef.current) {
        // Small delay to ensure state updates and abort is handled
        setTimeout(() => {
          handleSendMessage(undefined, true);
        }, 100);
      }
    }
  }, [selectedModel]);

  // Initial load from backend
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch chats
        const chatsRes = await fetch('/api/chats');
        if (chatsRes.ok) {
          const data = await chatsRes.json();
          if (data && data.length > 0) {
            setChats(data);
          } else {
            // Fallback to localStorage if backend is empty
            const saved = localStorage.getItem('ollama_chats');
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed.length > 0) {
                setChats(parsed);
                // Sync back to backend
                await fetch('/api/chats', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: saved,
                });
              }
            }
          }
        }
        
        // Fetch config
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
          const data = await configRes.json();
          if (data.systemPrompt) {
            setSystemPrompt(data.systemPrompt);
          } else {
            // Fallback to localStorage if backend is empty
            const saved = localStorage.getItem('ollama_system_prompt');
            if (saved) {
              setSystemPrompt(saved);
              // Sync back to backend
              await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemPrompt: saved }),
              });
            }
          }
        }

        // Fetch memory
        const memoryRes = await fetch('/api/memory');
        if (memoryRes.ok) {
          const data = await memoryRes.json();
          setMemory(data);
        }
      } catch (error) {
        console.error('Failed to fetch data from backend:', error);
        const saved = localStorage.getItem('ollama_chats');
        if (saved) setChats(JSON.parse(saved));
      }
    };
    fetchInitialData();
  }, []);

  // Sync to backend whenever chats change
  useEffect(() => {
    const syncChats = async () => {
      // Don't sync if we haven't even loaded yet (to avoid overwriting with empty)
      if (chats.length === 0 && localStorage.getItem('ollama_chats') === null) return;
      
      setIsSyncing(true);
      try {
        await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chats),
        });
        localStorage.setItem('ollama_chats', JSON.stringify(chats));
      } catch (error) {
        console.error('Failed to sync chats to backend:', error);
      } finally {
        setIsSyncing(false);
      }
    };

    const timeoutId = setTimeout(syncChats, 1000); // Debounce sync
    return () => clearTimeout(timeoutId);
  }, [chats]);

  // Sync config to backend
  useEffect(() => {
    const syncConfig = async () => {
      // Don't sync if we haven't even loaded yet
      if (systemPrompt === '' && localStorage.getItem('ollama_system_prompt') === null) return;
      
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt }),
        });
        localStorage.setItem('ollama_system_prompt', systemPrompt);
      } catch (error) {
        console.error('Failed to sync config to backend:', error);
      }
    };
    
    const timeoutId = setTimeout(syncConfig, 1000);
    return () => clearTimeout(timeoutId);
  }, [systemPrompt]);

  useEffect(() => {
    checkConnection();
  }, []);

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
  }, [connectionStatus]);

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkConnection = async () => {
    setConnectionStatus('checking');
    try {
      const response = await fetch('/api/ollama/tags');
      if (response.ok) {
        const data = await response.json();
        const fetchedModels = data.models || [];
        setModels(fetchedModels);
        
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
      toast.error('Cannot connect to Ollama via backend. Please check if Ollama is running on the server.', {
        id: 'connection-error',
        duration: 5000,
      });
    }
  };

  const fetchRunningModels = async () => {
    try {
      const response = await fetch('/api/ollama/ps');
      if (response.ok) {
        const data = await response.json();
        setRunningModels(data.models || []);
      }
    } catch (error) {
      // Silently fail for background polling
    }
  };

  useEffect(() => {
    if (newModelName.trim().length > 0) {
      const filtered = allOllamaModels
        .filter(m => m.toLowerCase().includes(newModelName.toLowerCase()))
        .filter(m => !models.some(installed => installed.name.split(':')[0] === m))
        .slice(0, 10);
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [newModelName, models]);

  const pullModel = async (nameOverride?: string) => {
    const modelName = (nameOverride || newModelName).trim();
    if (!modelName) return;
    
    setPullingModel({ name: modelName, progress: 0, status: 'Starting...' });
    setNewModelName('');
    setShowSuggestions(false);

    pullAbortController.current = new AbortController();

    try {
      // We just initiate the pull, Socket.io handles the progress updates
      const response = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: pullAbortController.current.signal,
      });

      if (!response.ok) throw new Error('Failed to pull model');
      
      // Wait for completion (the endpoint stays open until done)
      await response.text();
      
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
      const response = await fetch('/api/ollama/delete', {
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

  const clearAllChats = () => {
    if (confirm('Are you sure you want to clear all chats? This cannot be undone.')) {
      setChats([]);
      setActiveChatId(null);
      toast.success('All chats cleared');
    }
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
  };

  const exportData = () => {
    const data = JSON.stringify(chats, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ollama-chats-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chats exported successfully');
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedChats = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedChats)) {
          // Merge and avoid duplicates by ID if possible, but for simplicity just append
          setChats(prev => {
            const existingIds = new Set(prev.map(c => c.id));
            const uniqueImported = importedChats.filter(c => !existingIds.has(c.id));
            return [...uniqueImported, ...prev];
          });
          toast.success('Chats imported successfully');
        } else {
          toast.error('Invalid file format');
        }
      } catch (err) {
        toast.error('Error parsing file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSendMessage = async (e?: React.FormEvent, isRetry = false) => {
    e?.preventDefault();
    
    const messageContent = isRetry ? lastUserMessageRef.current : input.trim();
    if (!messageContent || ((isLoading || isAiTypingGlobally) && !isRetry) || !selectedModel) return;

    if (!isRetry) {
      lastUserMessageRef.current = messageContent;
    }

    let currentChatId = activeChatId;
    if (!currentChatId) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : ''),
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
      content: messageContent,
      timestamp: Date.now(),
    };

    if (!isRetry) {
      setChats(prev => prev.map(c => 
        c.id === currentChatId 
          ? { ...c, messages: [...c.messages, userMessage], title: c.messages.length === 0 ? messageContent.slice(0, 30) : c.title }
          : c
      ));
      setInput('');
    }
    
    setIsLoading(true);
    localStorage.setItem('ollama_is_loading', 'true');
    setIsAiTypingGlobally(true);

    // Create new abort controller for this chat
    chatAbortController.current = new AbortController();

    try {
      const response = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: currentChatId,
          model: selectedModel,
          messages: [
            { 
              role: 'system', 
              content: `${systemPrompt}${memory.facts.length > 0 ? `\n\nUser Information (Memory):\n- ${memory.facts.join('\n- ')}` : ''}` 
            },
            ...(chats.find(c => c.id === currentChatId)?.messages || []).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: messageContent }
          ],
        }),
        signal: chatAbortController.current.signal
      });

      if (!response.ok) throw new Error('Failed to connect to Ollama via backend');

      // We just wait for the request to complete. 
      // Socket.io handles all the UI updates (messages, typing status).
      await response.text();
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Chat request was aborted.');
        return;
      }
      toast.error('Error: Could not connect to Ollama via backend. Make sure it is running on the server.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const extractMemory = async (chatId: string) => {
    // This is now handled by the backend
  };

  const handleToolCalls = async (chatId: string, content: string) => {
    // This is now handled by the backend
  };

  const clearMemory = () => {
    if (confirm('Are you sure you want to clear all extracted facts? This will reset the AI\'s long-term memory of you.')) {
      const emptyMemory = { facts: [] };
      setMemory(emptyMemory);
      fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emptyMemory),
      });
      toast.success('Memory cleared');
    }
  };

  const saveSettings = () => {
    setCurrentView('chat');
    checkConnection();
    toast.success('Settings saved');
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f5f5f5]">
      <Toaster position="top-center" />
      
      <Sidebar 
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isMobile={isMobile}
        chats={chats}
        activeChatId={activeChatId}
        currentView={currentView}
        connectionStatus={connectionStatus}
        setActiveChatId={setActiveChatId}
        setCurrentView={setCurrentView}
        createNewChat={createNewChat}
        deleteChat={deleteChat}
        clearAllChats={clearAllChats}
        exportData={exportData}
        importData={importData}
        isSyncing={isSyncing}
      />

      <main className="flex-1 flex flex-col relative min-w-0">
        <Header 
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          currentView={currentView}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          models={models}
          runningModels={runningModels}
          connectionStatus={connectionStatus}
          checkConnection={checkConnection}
          setShowSettings={() => setCurrentView('settings')}
          isBusy={isLoading || isAiTypingGlobally}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {currentView === 'chat' && (
            <div className="flex h-full overflow-hidden">
              <div className="flex-1 border-r border-gray-200">
                <ChatView 
                  activeChatId={activeChatId}
                  activeChat={activeChat}
                  isLoading={isLoading || isAiTypingGlobally}
                  isAiTypingGlobally={isAiTypingGlobally && !isLoading}
                  input={input}
                  setInput={setInput}
                  handleSendMessage={handleSendMessage}
                  createNewChat={createNewChat}
                  connectionStatus={connectionStatus}
                  messagesEndRef={messagesEndRef}
                />
              </div>
              <div className="w-[40%] hidden lg:block">
                <WorkspaceView refreshTrigger={workspaceRefreshTrigger} />
              </div>
            </div>
          )}
          
          {currentView === 'models' && (
            <div className="flex-1 overflow-y-auto bg-gray-50/30">
              <ModelsView 
                models={models}
                runningModels={runningModels}
                connectionStatus={connectionStatus}
                modelSearchQuery={modelSearchQuery}
                setModelSearchQuery={setModelSearchQuery}
                deleteModel={deleteModel}
                setSelectedModel={setSelectedModel}
                setCurrentView={setCurrentView}
                activeChatId={activeChatId}
                createNewChat={createNewChat}
                formatSize={formatSize}
              />
            </div>
          )}

          {currentView === 'pull' && (
            <div className="flex-1 overflow-y-auto bg-gray-50/30">
              <PullView 
                newModelName={newModelName}
                setNewModelName={setNewModelName}
                pullModel={pullModel}
                pullingModel={pullingModel}
                cancelPull={cancelPull}
                showSuggestions={showSuggestions}
                setShowSuggestions={setShowSuggestions}
                suggestions={suggestions}
                popularModels={popularModels}
              />
            </div>
          )}

          {currentView === 'workspace' && (
            <WorkspaceView refreshTrigger={workspaceRefreshTrigger} />
          )}

          {currentView === 'settings' && (
            <SettingsView 
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
              memory={memory}
              clearMemory={clearMemory}
              saveSettings={saveSettings}
              connectionStatus={connectionStatus}
            />
          )}
        </div>
      </main>
    </div>
  );
}
