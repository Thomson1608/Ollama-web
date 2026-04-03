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
import { LoginView } from './components/LoginView';
import { Chat, Message, OllamaModel, RunningModel, ViewType, ConnectionStatus, Memory, ToolCall, ModelParameters } from './types';

export default function App() {
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('ollama_username'));
  const [chats, setChats] = useState<Chat[]>([]);
  const ADMIN_SYSTEM_PROMPT = `You are a world-class software engineer.
You have access to a workspace where you can read, write, and list files.

CRITICAL DIRECTIVES:
1. NEVER output code blocks directly in the chat window.
2. ALWAYS use the 'write_file' tool to save code to the workspace.
3. If you need to show code, you MUST write it to a file first.
4. The user wants to see the code in the workspace on the right, NOT in the chat.
5. For multiple files, use multiple tool calls.
6. If building a web app, create a full project (package.json, etc.). The system auto-runs 'npm install' and 'npm run dev'.
7. DO NOT use markdown code blocks ( \`\`\` ) unless they are part of a tool call argument.
8. If the user asks for code, your response should ONLY contain a brief explanation of what you are doing and the necessary <tool_call> tags.

TOOL USAGE RULES:
- Use <tool_call> tags for all tool invocations.
- Format: <tool_call>{"tool": "write_file", "args": {"name": "path/to/file.ts", "content": "..."}}</tool_call>
- Briefly explain your plan, then execute the tool calls.
- Do not repeat the code in the chat after writing it to a file.

AVAILABLE TOOLS:

1. list_files: List all files in the workspace.
   Usage: <tool_call>{"tool": "list_files", "args": {}}</tool_call>

2. read_file: Read the content of a specific file.
   Usage: <tool_call>{"tool": "read_file", "args": {"name": "filename.txt"}}</tool_call>

3. write_file: Write content to a file (creates or overwrites).
   Usage: <tool_call>{"tool": "write_file", "args": {"name": "filename.txt", "content": "file content here"}}</tool_call>

4. delete_file: Delete a file from the workspace.
   Usage: <tool_call>{"tool": "delete_file", "args": {"name": "filename.txt"}}</tool_call>

Your primary goal is to manage the workspace files efficiently while keeping the chat clean of large code blocks.`;

  const USER_SYSTEM_PROMPT = `You are a helpful AI assistant. 
Your goal is to provide clear, accurate, and helpful information to the user.
You do NOT have access to any file system or workspace tools.
If the user asks you to write code, you should provide it in a markdown code block within the chat.
`;

  const [systemPrompt, setSystemPrompt] = useState(() => {
    const saved = localStorage.getItem('ollama_system_prompt');
    if (saved) return saved;
    return username === 'admin' ? ADMIN_SYSTEM_PROMPT : USER_SYSTEM_PROMPT;
  });

  // Update system prompt when username changes
  useEffect(() => {
    if (!localStorage.getItem('ollama_system_prompt')) {
      setSystemPrompt(username === 'admin' ? ADMIN_SYSTEM_PROMPT : USER_SYSTEM_PROMPT);
    }
  }, [username]);
  const [globalParameters, setGlobalParameters] = useState<ModelParameters>({
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    maxTokens: undefined,
    stop: [],
    jsonMode: false
  });
  const [memory, setMemory] = useState<Memory>({ facts: [] });
  const [isSyncing, setIsSyncing] = useState(false);
  const isRemoteUpdate = useRef(false);
  const isRemoteConfigUpdate = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('chat');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatingChatIds, setGeneratingChatIds] = useState<Set<string>>(new Set());
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
  const [modelFilter, setModelFilter] = useState<'local' | 'cloud-local'>('local');

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
    { name: 'llama3.2', description: 'Meta\'s latest lightweight model', type: 'local' },
    { name: 'llama3.1', description: 'Meta\'s most capable open model', type: 'local' },
    { name: 'mistral', description: 'High performance 7B model', type: 'local' },
    { name: 'phi3', description: 'Microsoft\'s efficient small model', type: 'local' },
    { name: 'gemma2', description: 'Google\'s lightweight open model', type: 'local' },
    { name: 'qwen2.5', description: 'Alibaba\'s powerful language model', type: 'local' },
    { name: 'deepseek-v2', description: 'Strong reasoning and coding model', type: 'local' },
    { name: 'codellama', description: 'Specialized for code generation', type: 'local' },
    { name: 'claude-3-5-sonnet-20240620', description: 'Anthropic\'s most intelligent model', type: 'claude' },
    { name: 'claude-3-opus-20240229', description: 'Anthropic\'s most powerful model', type: 'claude' },
    { name: 'claude-3-haiku-20240307', description: 'Anthropic\'s fastest model', type: 'claude' },
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

  // Socket.io initialization
  useEffect(() => {
    if (!isInitialized || !username) return;

    console.log(`Socket.io: Initializing client for ${username}...`);
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5
    });
    socketRef.current = socket;

    socket.on(`chat:status:${username}`, ({ loading, chatId }) => {
      console.log('Socket.io: chat:status event received:', loading, chatId);
      if (chatId) {
        setGeneratingChatIds(prev => {
          const next = new Set(prev);
          if (loading) next.add(chatId);
          else next.delete(chatId);
          return next;
        });
      }
    });

    socket.on('connect', () => {
      console.log('Socket.io: Connected to server with ID:', socket.id);
    });

    socket.on(`chat:start:${username}`, ({ chatId, userMessage, assistantMessage, model }) => {
      console.log('Socket.io: chat:start event received for chat:', chatId);
      
      setGeneratingChatIds(prev => {
        const next = new Set(prev);
        next.add(chatId);
        return next;
      });

      setChats(prev => {
        const chat = prev.find(c => c.id === chatId);
        if (chat) {
          const lastMsg = chat.messages[chat.messages.length - 1];
          const alreadyHasUserMsg = lastMsg && lastMsg.role === 'user' && lastMsg.content === userMessage.content;
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
    });

    socket.on(`chat:chunk:${username}`, ({ chatId, chunk }) => {
      setChats(prev => {
        const chat = prev.find(c => c.id === chatId);
        if (!chat) {
          // If chat doesn't exist locally (e.g. connected after chat started),
          // it should have been fetched in initial data or we'll get it in chat:end.
          // But for better UX, let's create a placeholder if it's missing.
          const newChat: Chat = {
            id: chatId,
            title: 'New Conversation...',
            messages: [{ role: 'assistant', content: chunk, timestamp: Date.now() }],
            model: selectedModel || 'unknown',
            createdAt: Date.now(),
          };
          setGeneratingChatIds(prevIds => {
            const next = new Set(prevIds);
            next.add(chatId);
            return next;
          });
          return [newChat, ...prev];
        }

        return prev.map(c => 
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
        );
      });
    });

    socket.on(`chat:end:${username}`, ({ chatId, finalContent }) => {
      console.log('Socket.io: chat:end event received for chat:', chatId);
      setGeneratingChatIds(prev => {
        const next = new Set(prev);
        next.delete(chatId);
        return next;
      });
      
      if (finalContent) {
        setChats(prev => {
          const chat = prev.find(c => c.id === chatId);
          if (!chat) {
            const newChat: Chat = {
              id: chatId,
              title: finalContent.slice(0, 30) + (finalContent.length > 30 ? '...' : ''),
              messages: [{ role: 'assistant', content: finalContent, timestamp: Date.now() }],
              model: selectedModel || 'unknown',
              createdAt: Date.now(),
            };
            return [newChat, ...prev];
          }

          return prev.map(c => 
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
          );
        });
      }
    });

    socket.on(`chats:updated:${username}`, (updatedChats) => {
      console.log('Socket.io: chats:updated event received');
      isRemoteUpdate.current = true;
      setChats(updatedChats);
    });

    socket.on(`config:updated:${username}`, (updatedConfig) => {
      console.log('Socket.io: config:updated event received');
      if (updatedConfig.systemPrompt !== undefined) {
        isRemoteConfigUpdate.current = true;
        setSystemPrompt(updatedConfig.systemPrompt);
      }
    });

    socket.on(`memory:updated:${username}`, (updatedMemory) => {
      console.log('Socket.io: memory:updated event received');
      setMemory(updatedMemory);
    });

    socket.on(`tool:result:${username}`, ({ chatId, tool, result }) => {
      console.log(`Socket.io: tool:result event received (${tool}):`, result);
      toast.info(result, { id: `tool-${chatId}-${tool}` });
    });

    socket.on(`workspace:updated:${username}`, () => {
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
  }, [isInitialized, username]);

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
    if (!username) {
      setIsInitialized(true);
      return;
    }

    const fetchInitialData = async () => {
      try {
        const headers = { 'x-username': username };
        
        // Fetch chats
        const chatsRes = await fetch('/api/chats', { headers });
        if (chatsRes.ok) {
          const data = await chatsRes.json();
          isRemoteUpdate.current = true;
          setChats(data.chats || data || []);
          if (data.generatingChatIds) {
            setGeneratingChatIds(new Set(data.generatingChatIds));
          }
        }
        
        // Fetch config
        const configRes = await fetch('/api/config', { headers });
        if (configRes.ok) {
          const data = await configRes.json();
          if (data.systemPrompt) {
            setSystemPrompt(data.systemPrompt);
          }
          if (data.parameters) {
            setGlobalParameters(data.parameters);
          }
        }

        // Fetch memory
        const memoryRes = await fetch('/api/memory', { headers });
        if (memoryRes.ok) {
          const data = await memoryRes.json();
          setMemory(data);
        }
      } catch (error) {
        console.error('Failed to fetch data from backend:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    fetchInitialData();
  }, [username]);

  // Sync to backend whenever chats change
  useEffect(() => {
    if (!isInitialized || !username) return;

    if (isRemoteUpdate.current || generatingChatIds.size > 0) {
      isRemoteUpdate.current = false;
      return;
    }

    const syncChats = async () => {
      setIsSyncing(true);
      try {
        await fetch('/api/chats', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-username': username
          },
          body: JSON.stringify(chats),
        });
      } catch (error) {
        console.error('Failed to sync chats to backend:', error);
      } finally {
        setIsSyncing(false);
      }
    };

    const timeoutId = setTimeout(syncChats, 1000);
    return () => clearTimeout(timeoutId);
  }, [chats, isInitialized, generatingChatIds.size, username]);

  // Sync config to backend
  useEffect(() => {
    if (!isInitialized || !username) return;

    if (isRemoteConfigUpdate.current) {
      isRemoteConfigUpdate.current = false;
      return;
    }

    const syncConfig = async () => {
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-username': username
          },
          body: JSON.stringify({ systemPrompt, parameters: globalParameters }),
        });
      } catch (error) {
        console.error('Failed to sync config to backend:', error);
      }
    };
    
    const timeoutId = setTimeout(syncConfig, 1000);
    return () => clearTimeout(timeoutId);
  }, [systemPrompt, globalParameters, isInitialized, username]);

  useEffect(() => {
    checkConnection();
  }, []);

  useEffect(() => {
    localStorage.setItem('ollama_selected_model', selectedModel);
  }, [selectedModel]);

  // Poll for running models
  useEffect(() => {
    const interval = setInterval(() => {
      if (connectionStatus === 'connected') {
        fetchRunningModels();
      }
    }, isLoading ? 1000 : 5000); // Poll every 1s if loading, 5s otherwise
    return () => clearInterval(interval);
  }, [connectionStatus, isLoading]);

  // Check if model is still running while loading
  useEffect(() => {
    if (isLoading && runningModels.length > 0) {
      const isModelRunning = runningModels.some(m => m.name === selectedModel);
      if (!isModelRunning) {
        // Model crashed!
        setIsLoading(false);
        if (activeChatId) {
          setGeneratingChatIds(prev => {
            const next = new Set(prev);
            next.delete(activeChatId);
            return next;
          });
        }
        toast.error('Model stopped unexpectedly.');
      }
    }
  }, [isLoading, runningModels, selectedModel, activeChatId]);

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages, isLoading]);

  useEffect(() => {
    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        
        // On iOS, windowHeight stays same, viewportHeight shrinks.
        // On Android, both shrink.
        const keyboardHeight = Math.max(0, windowHeight - viewportHeight);
        
        if (keyboardHeight > 100) {
          document.documentElement.style.setProperty('--keyboard-offset', `${keyboardHeight}px`);
          // Use a small delay to ensure the DOM has updated before scrolling
          requestAnimationFrame(() => {
            scrollToBottom();
          });
        } else {
          document.documentElement.style.setProperty('--keyboard-offset', '0px');
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
    };
  }, []);

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

      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = 'Failed to pull model';
        try {
          const parsed = JSON.parse(errorData);
          if (parsed.error) {
            errorMessage = parsed.error;
            if (parsed.signin_url) {
              errorMessage = `Model requires authentication or does not exist. Please check the model name or sign in: ${parsed.signin_url}`;
            }
          }
        } catch (e) {
          errorMessage = errorData || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      // Wait for completion (the endpoint stays open until done)
      await response.text();
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.info(`Pulling ${modelName} cancelled`);
      } else {
        const message = error.message || `Failed to pull model ${modelName}`;
        if (message.includes('usage limit')) {
          toast.error('Ollama Cloud Limit Reached: You have reached your weekly usage limit for cloud models. Please upgrade your Ollama account or try again later.', {
            duration: 6000
          });
        } else {
          toast.error(`Error: ${message}`);
        }
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

  const updateChatSystemPrompt = (chatId: string, prompt: string) => {
    setChats(prev => prev.map(chat => 
      chat.id === chatId ? { ...chat, systemPrompt: prompt } : chat
    ));
  };

  const handleSendMessage = async (e?: React.FormEvent, isRetry = false, image?: string | null) => {
    e?.preventDefault();
    
    const messageContent = isRetry ? lastUserMessageRef.current : input.trim();
    const isGloballyTyping = generatingChatIds.size > 0;
    if ((!messageContent && !image) || ((isLoading || isGloballyTyping) && !isRetry) || !selectedModel) return;

    if (!isRetry) {
      lastUserMessageRef.current = messageContent;
    }

    let currentChatId = activeChatId;
    if (!currentChatId) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: messageContent ? (messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : '')) : 'Image Chat',
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
      images: image ? [image.split(',')[1]] : undefined
    };

    if (!isRetry) {
      setChats(prev => prev.map(c => 
        c.id === currentChatId 
          ? { ...c, messages: [...c.messages, userMessage], title: c.messages.length === 0 ? (messageContent ? messageContent.slice(0, 30) : 'Image Chat') : c.title }
          : c
      ));
      setInput('');
    }
    
    setIsLoading(true);
    if (currentChatId) {
      setGeneratingChatIds(prev => {
        const next = new Set(prev);
        next.add(currentChatId);
        return next;
      });
    }

    const currentChat = chats.find(c => c.id === currentChatId);

    // Create new abort controller for this chat
    chatAbortController.current = new AbortController();

    try {
      const response = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username || ''
        },
        body: JSON.stringify({
          chatId: currentChatId,
          model: selectedModel,
          systemPrompt: currentChat?.systemPrompt || systemPrompt,
          parameters: currentChat?.parameters || globalParameters,
          messages: [
            ...(chats.find(c => c.id === currentChatId)?.messages || []).map(m => ({ role: m.role, content: m.content, images: m.images })),
            { role: 'user', content: messageContent, images: image ? [image.split(',')[1]] : undefined }
          ],
        }),
        signal: chatAbortController.current.signal
      });

      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = 'Failed to connect to AI service';
        try {
          const parsed = JSON.parse(errorData);
          if (parsed.error) {
            errorMessage = parsed.error;
            if (parsed.signin_url) {
              errorMessage = `Model requires authentication or does not exist. Please check the model name or sign in: ${parsed.signin_url}`;
            }
          }
        } catch (e) {
          errorMessage = errorData || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // We just wait for the request to complete. 
      // Socket.io handles all the UI updates (messages, typing status).
      await response.text();
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Chat request was aborted.');
        return;
      }
      
      const message = error.message || 'Failed to connect to AI service. Please check your connection.';
      if (message.includes('usage limit')) {
        toast.error('Ollama Cloud Limit Reached: You have reached your weekly usage limit for cloud models. Please switch to a local model or upgrade your Ollama account.', {
          duration: 6000
        });
      } else {
        toast.error(`Error: ${message}`);
      }
      console.error(error);
    } finally {
      setIsLoading(false);
      if (currentChatId) {
        setGeneratingChatIds(prev => {
          const next = new Set(prev);
          next.delete(currentChatId);
          return next;
        });
      }
    }
  };

  const clearMemory = () => {
    if (confirm('Are you sure you want to clear all extracted facts? This will reset the AI\'s long-term memory of you.')) {
      const emptyMemory = { facts: [] };
      setMemory(emptyMemory);
      fetch('/api/memory', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username || ''
        },
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

  const handleLogin = (user: string) => {
    setUsername(user);
    localStorage.setItem('ollama_username', user);
    toast.success(`Welcome, ${user}!`);
  };

  const handleLogout = () => {
    setUsername(null);
    localStorage.removeItem('ollama_username');
    setChats([]);
    setActiveChatId(null);
    toast.info('Logged out');
  };

  if (!username) {
    return (
      <div className="h-[100dvh] w-full bg-[#f5f5f5] overflow-hidden">
        <Toaster position="top-center" />
        <LoginView onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#f5f5f5]">
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
        isSyncing={isSyncing}
        username={username}
        onLogout={handleLogout}
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
          isBusy={isLoading || generatingChatIds.size > 0}
        />

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentView === 'chat' && (
              <div className="flex h-full overflow-hidden">
                <div className="flex-1">
                  <ChatView 
                    activeChatId={activeChatId}
                    activeChat={activeChat}
                    isLoading={isLoading || (activeChatId ? generatingChatIds.has(activeChatId) : false)}
                    isAiTypingGlobally={activeChatId ? generatingChatIds.has(activeChatId) && !isLoading : false}
                    isGloballyBusy={generatingChatIds.size > 0}
                    input={input}
                    setInput={setInput}
                    handleSendMessage={handleSendMessage}
                    createNewChat={createNewChat}
                    connectionStatus={connectionStatus}
                    messagesEndRef={messagesEndRef}
                    onUpdateSystemPrompt={(prompt) => activeChatId && updateChatSystemPrompt(activeChatId, prompt)}
                    username={username}
                  />
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
                  modelFilter={modelFilter}
                  setModelFilter={setModelFilter}
                  popularModels={popularModels}
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
                  modelFilter={modelFilter}
                  setModelFilter={setModelFilter}
                />
              </div>
            )}

            {currentView === 'workspace' && (
              <WorkspaceView 
                refreshTrigger={workspaceRefreshTrigger} 
                socket={socketRef.current} 
                isMobile={isMobile}
                username={username}
              />
            )}

            {currentView === 'settings' && (
              <SettingsView 
                systemPrompt={systemPrompt}
                setSystemPrompt={setSystemPrompt}
                parameters={globalParameters}
                setParameters={setGlobalParameters}
                memory={memory}
                clearMemory={clearMemory}
                saveSettings={saveSettings}
                connectionStatus={connectionStatus}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
