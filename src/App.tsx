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
import { ProjectInitView } from './components/ProjectInitView';
import { ProjectListView } from './components/ProjectListView';
import { Chat, Message, OllamaModel, RunningModel, ViewType, ConnectionStatus, Memory, ToolCall, ModelParameters, Project } from './types';

export default function App() {
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('ollama_username'));
  const [projectId, setProjectId] = useState<string | null>(() => localStorage.getItem('ollama_project_id'));
  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const ADMIN_SYSTEM_PROMPT = `You are a world-class Senior Software Engineer and Local Developer Agent.
You have FULL authority over the workspace and can manage files and execute commands as if you were working on your own local machine.

CRITICAL WORKFLOW:
1. THINK: Always start your response with a <thought> block. Explain your reasoning, plan, and the specific steps you will take (e.g., "I will install the dependencies, then create the project structure...").
2. EXECUTE: Use <tool_call> tags to perform workspace operations. You can call multiple tools in sequence.
3. RESPOND: Provide a concise summary of what you've done.

CRITICAL DIRECTIVES:
1. YOU ARE AN AGENT: Do not just suggest code; IMPLEMENT it. Use 'write_file' for all code changes.
2. IDE-LIKE INTEGRATION: Treat the workspace as your IDE. Use 'list_files' to explore, 'read_file' to understand, and 'run_command' to manage the environment.
3. LINUX POWER: You have access to a Linux-like environment. Use 'run_command' for:
   - Installing dependencies: 'npm install <package>'
   - Creating directories: 'mkdir -p path/to/dir'
   - Searching code: 'grep -r "pattern" .'
   - Running build scripts or tests.
4. CLEAN CHAT: Do not output large code blocks in the chat. The workspace is the source of truth.
5. NO MARKDOWN CODE BLOCKS: Do NOT use \`\`\` for source code in your response text. Only use them inside <tool_call> arguments if necessary.

AVAILABLE TOOLS:
1. list_files: List all files in the workspace.
2. read_file: {"name": "path/to/file"} - Read file content.
3. write_file: {"name": "path/to/file", "content": "..."} - Write/Update file.
4. delete_file: {"name": "path/to/file"} - Delete file or directory.
5. run_command: {"command": "..."} - Execute any shell command in the workspace.

Your goal is to be a proactive, highly capable developer who gets things done directly in the workspace.`;

  const USER_SYSTEM_PROMPT = `You are a helpful AI assistant. 
Your goal is to provide clear, accurate, and helpful information to the user.
You do NOT have access to any file system or workspace tools.
If the user asks you to write code, you should provide it in a markdown code block within the chat.
`;

  const [systemPrompt, setSystemPrompt] = useState(() => {
    const saved = localStorage.getItem('ollama_system_prompt');
    if (saved) return saved;
    // Default to ADMIN_SYSTEM_PROMPT for all users to enable IDE-like features
    return ADMIN_SYSTEM_PROMPT;
  });

  // Update system prompt when username changes
  useEffect(() => {
    if (!localStorage.getItem('ollama_system_prompt')) {
      setSystemPrompt(ADMIN_SYSTEM_PROMPT);
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
  const [activeChatId, setActiveChatId] = useState<string | null>(() => localStorage.getItem('ollama_active_chat_id'));
  const [currentView, setCurrentView] = useState<ViewType>(() => (localStorage.getItem('ollama_current_view') as ViewType) || 'chat');
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

  // Sync activeChatId to localStorage
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('ollama_active_chat_id', activeChatId);
    } else {
      localStorage.removeItem('ollama_active_chat_id');
    }
  }, [activeChatId]);

  // Sync currentView to localStorage
  useEffect(() => {
    localStorage.setItem('ollama_current_view', currentView);
  }, [currentView]);

  // Redirect to project list if no project is selected
  useEffect(() => {
    if (isInitialized && username && !projectId && (currentView === 'chat' || currentView === 'workspace')) {
      setCurrentView('project-list');
      toast.error('Please select a project first');
    }
  }, [currentView, projectId, isInitialized, username]);

  // Fetch chats and memory when projectId changes
  useEffect(() => {
    if (projectId && username) {
      fetchChats(projectId);
      fetchMemory(projectId);
    }
  }, [projectId, username]);

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

  // Fetch projects when username changes
  useEffect(() => {
    if (username) {
      fetchProjects();
    }
  }, [username]);

  const fetchProjects = async () => {
    if (!username) return;
    try {
      const response = await fetch('/api/projects', {
        headers: { 'x-username': username }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects', error);
    }
  };

  const handleSelectProject = (project: Project) => {
    setProjectId(project.id);
    localStorage.setItem('ollama_project_id', project.id);
    setCurrentView('chat');
    setActiveChatId(null);
    setChats([]);
    toast.success(`Project ${project.name} selected`);
  };

  const handleDeleteProject = async (id: string) => {
    if (!username) return;
    if (!confirm('Are you sure you want to delete this project? All code and chats will be lost.')) return;
    
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        headers: { 'x-username': username }
      });
      if (response.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (projectId === id) {
          setProjectId(null);
          localStorage.removeItem('ollama_project_id');
          setActiveChatId(null);
          setChats([]);
          setCurrentView('project-list');
        }
        toast.success('Project deleted');
      }
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const fetchChats = async (pId: string) => {
    if (!username) return;
    try {
      const response = await fetch(`/api/chats?projectId=${pId}`, {
        headers: { 'x-username': username }
      });
      if (response.ok) {
        const data = await response.json();
        isRemoteUpdate.current = true;
        setChats(data.chats);
        setGeneratingChatIds(new Set(data.generatingChatIds));
      }
    } catch (error) {
      console.error('Failed to fetch chats', error);
    }
  };

  const fetchMemory = async (pId: string) => {
    if (!username) return;
    try {
      const response = await fetch(`/api/memory?projectId=${pId}`, {
        headers: { 'x-username': username }
      });
      if (response.ok) {
        const data = await response.json();
        setMemory(data);
      }
    } catch (error) {
      console.error('Failed to fetch memory', error);
    }
  };

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
      if (!projectId) return;
      setIsSyncing(true);
      try {
        await fetch(`/api/chats?projectId=${projectId}`, {
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

  const handleInstallDependencies = async () => {
    if (!username || !projectId) return;
    setIsSyncing(true);
    try {
      const response = await fetch('/api/workspace/install', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ projectId })
      });
      if (response.ok) {
        toast.success('Dependencies installed successfully');
      } else {
        const data = await response.json();
        toast.error(`Failed to install: ${data.error}`);
      }
    } catch (error) {
      toast.error('Failed to install dependencies');
    } finally {
      setIsSyncing(false);
    }
  };

  const createNewChat = async () => {
    if (!username || !projectId) return;
    
    // Inherit prompt from last chat if exists
    let inheritedPrompt = systemPrompt;
    if (chats.length > 0) {
      const lastChat = chats[0]; // Assuming chats are sorted by date desc
      const lastMessages = lastChat.messages.slice(-4);
      if (lastMessages.length > 0) {
        inheritedPrompt = `${systemPrompt}\n\nContext from previous conversation:\n${lastMessages.map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')}`;
      }
    }

    const id = Date.now().toString();
    const newChat: Chat = {
      id,
      title: 'New Chat',
      messages: [],
      model: selectedModel || 'llama3.2',
      createdAt: Date.now(),
      systemPrompt: inheritedPrompt,
      parameters: globalParameters,
      isClosed: false
    };
    
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(id);
    setCurrentView('chat');
    if (isMobile) setIsSidebarOpen(false);

    try {
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ projectId, chat: newChat })
      });
    } catch (error) {
      console.error('Failed to create chat', error);
    }
  };

  const closeChat = async (id: string) => {
    if (!username || !projectId) return;
    try {
      const response = await fetch(`/api/chats/${id}/close`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ projectId })
      });
      if (response.ok) {
        setChats(prev => prev.map(c => c.id === id ? { ...c, isClosed: true } : c));
        toast.success('Chat closed. It is now read-only.');
      }
    } catch (error) {
      toast.error('Failed to close chat');
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!username || !projectId) return;
    
    try {
      const response = await fetch(`/api/chats/${id}?projectId=${projectId}`, {
        method: 'DELETE',
        headers: { 'x-username': username }
      });
      
      if (response.ok) {
        setChats(chats.filter(c => c.id !== id));
        if (activeChatId === id) {
          setActiveChatId(null);
        }
        toast.success('Chat deleted');
      } else {
        toast.error('Failed to delete chat');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    }
  };

  const clearAllChats = async () => {
    if (confirm('Are you sure you want to clear all chats? This cannot be undone.')) {
      if (!username || !projectId) return;
      
      try {
        const response = await fetch(`/api/chats?projectId=${projectId}`, {
          method: 'DELETE',
          headers: { 'x-username': username }
        });
        
        if (response.ok) {
          setChats([]);
          setActiveChatId(null);
          toast.success('All chats cleared');
        } else {
          toast.error('Failed to clear chats');
        }
      } catch (error) {
        console.error('Error clearing chats:', error);
        toast.error('Failed to clear chats');
      }
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

  const handleRenameChat = (id: string, newTitle: string) => {
    setChats(prev => prev.map(chat => 
      chat.id === id ? { ...chat, title: newTitle } : chat
    ));
    toast.success('Chat renamed');
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
          projectId: projectId,
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
    setCurrentView('project-list');
    toast.success(`Welcome, ${user}!`);
  };

  const handleLogout = () => {
    setUsername(null);
    setProjectId(null);
    localStorage.removeItem('ollama_username');
    localStorage.removeItem('ollama_project_id');
    setChats([]);
    setProjects([]);
    setActiveChatId(null);
    toast.info('Logged out');
  };

  const handleInitProject = async (name: string, details: string) => {
    if (!username) return;
    setIsLoading(true);
    console.log(`[ProjectInit] Starting initialization for project: ${name}`);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ name, details }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ProjectInit] Server error:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to create project');
      }
      
      const project = await response.json();
      console.log('[ProjectInit] Project created successfully:', project.id);
      setProjects(prev => [project, ...prev]);
      setProjectId(project.id);
      localStorage.setItem('ollama_project_id', project.id);
      
      const newChatId = Date.now().toString();
      const userMessage: Message = {
        role: 'user',
        content: `Khởi tạo project: ${name}\nChi tiết: ${details}\n\nHãy giúp tôi thiết lập cấu trúc cơ bản cho project này.`,
        timestamp: Date.now()
      };

      setCurrentView('chat');
      setActiveChatId(newChatId);

      console.log('[ProjectInit] Sending initialization chat message...');
      // Send the initialization message
      const chatResponse = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({
          chatId: newChatId,
          projectId: project.id,
          model: selectedModel,
          systemPrompt: systemPrompt,
          parameters: globalParameters,
          messages: [userMessage],
        }),
      });

      if (!chatResponse.ok) {
        console.error('[ProjectInit] Failed to send init message:', chatResponse.status);
        throw new Error('Failed to send init message');
      }
      console.log('[ProjectInit] Initialization complete.');
      await chatResponse.text();
    } catch (error) {
      console.error('[ProjectInit] Error during initialization:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to initialize project');
    } finally {
      setIsLoading(false);
    }
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
      
      {currentView !== 'project-list' && currentView !== 'project-init' && (
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
          onRenameChat={handleRenameChat}
          clearAllChats={clearAllChats}
          isSyncing={isSyncing}
          username={username}
          onLogout={handleLogout}
        />
      )}

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
          username={username}
          onLogout={handleLogout}
        />

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentView === 'project-list' && (
              <ProjectListView 
                projects={projects} 
                onSelectProject={handleSelectProject} 
                onCreateProject={() => setCurrentView('project-init')}
                onDeleteProject={(id) => handleDeleteProject(id)}
              />
            )}

            {currentView === 'project-init' && (
              <ProjectInitView onInit={handleInitProject} isLoading={isLoading} />
            )}

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
                    projectId={projectId}
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
                projectId={projectId || undefined}
                onInstallDependencies={handleInstallDependencies}
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
                username={username}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
