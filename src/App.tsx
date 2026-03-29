/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
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
  const [systemPrompt, setSystemPrompt] = useState('');
  const [memory, setMemory] = useState<Memory>({ facts: [] });
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('chat');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pullingModel, setPullingModel] = useState<{ name: string; progress: number; status: string } | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('ollama_url') || 'http://localhost:11434');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('ollama_selected_model') || '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [newModelName, setNewModelName] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  const activeChat = chats.find(c => c.id === activeChatId);

  // Initial load from backend
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch chats
        const chatsRes = await fetch('/api/chats');
        if (chatsRes.ok) {
          const data = await chatsRes.json();
          setChats(data);
        }
        
        // Fetch config
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
          const data = await configRes.json();
          if (data.systemPrompt) setSystemPrompt(data.systemPrompt);
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
      if (chats.length === 0) return;
      
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
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt }),
        });
      } catch (error) {
        console.error('Failed to sync config to backend:', error);
      }
    };
    if (systemPrompt) {
      const timeoutId = setTimeout(syncConfig, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [systemPrompt]);

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
      toast.error('Cannot connect to Ollama. Please check if Ollama is running and CORS is enabled.', {
        id: 'connection-error',
        duration: 5000,
      });
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
      const toolInstructions = `
You have access to a workspace file system. You can perform the following actions by including a JSON block in your response using the format:
<tool_call>
{
  "tool": "write_file",
  "args": { "name": "filename.txt", "content": "file content" }
}
</tool_call>

Available tools:
- write_file: Create or overwrite a file. Args: { "name": string, "content": string }
- read_file: Read a file's content. Args: { "name": string }
- list_files: List all files in the workspace. Args: {}
- delete_file: Delete a file. Args: { "name": string }

When you want to create code or save information, use the write_file tool.
`;

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { 
              role: 'system', 
              content: `${systemPrompt}${memory.facts.length > 0 ? `\n\nUser Information (Memory):\n- ${memory.facts.join('\n- ')}` : ''}\n\n${toolInstructions}` 
            },
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
      
      // Extract memory after assistant finishes
      extractMemory(currentChatId);
      
      // Check for tool calls in the assistant's response
      handleToolCalls(currentChatId, assistantContent);
      
    } catch (error) {
      toast.error('Error: Could not connect to Ollama. Make sure it is running and OLLAMA_ORIGINS is set.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const extractMemory = async (chatId: string) => {
    // We need to get the latest state of chats
    setChats(prevChats => {
      const chat = prevChats.find(c => c.id === chatId);
      if (!chat || chat.messages.length < 2) return prevChats;

      // Run extraction in background
      (async () => {
        const recentMessages = chat.messages.slice(-6);
        const context = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');

        try {
          const response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: selectedModel,
              messages: [
                { 
                  role: 'system', 
                  content: `You are a memory extraction module. Your task is to extract personal facts, preferences, or important information about the user from the conversation. 
                  CRITICAL: Also extract the user's preferred language and communication style (e.g., "User prefers communicating in Vietnamese", "User likes technical explanations").
                  
                  Current Memory: ${memory.facts.join(', ')}
                  
                  Output ONLY a JSON array of strings representing NEW facts found in this snippet. 
                  If no new facts are found, output []. 
                  Do NOT repeat facts already in memory.
                  Example output: ["User prefers communicating in Vietnamese", "User is a software engineer"]` 
                },
                { role: 'user', content: `Extract facts from this conversation:\n${context}` }
              ],
              stream: false,
            }),
          });

          if (response.ok) {
            const json = await response.json();
            const content = json.message?.content || '[]';
            try {
              const match = content.match(/\[.*\]/s);
              if (match) {
                const newFacts = JSON.parse(match[0]);
                if (Array.isArray(newFacts) && newFacts.length > 0) {
                  setMemory(prevMemory => {
                    const updatedMemory = { facts: [...new Set([...prevMemory.facts, ...newFacts])] };
                    fetch('/api/memory', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(updatedMemory),
                    });
                    return updatedMemory;
                  });
                }
              }
            } catch (e) {
              console.error('Failed to parse memory extraction result', e);
            }
          }
        } catch (error) {
          console.error('Memory extraction failed', error);
        }
      })();

      return prevChats;
    });
  };

  const handleToolCalls = async (chatId: string, content: string) => {
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;
    const toolCalls: ToolCall[] = [];

    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        const call = JSON.parse(match[1]);
        toolCalls.push(call);
      } catch (e) {
        console.error('Failed to parse tool call', e);
      }
    }

    if (toolCalls.length === 0) return;

    for (const call of toolCalls) {
      let result = '';
      try {
        switch (call.tool) {
          case 'write_file':
            const writeRes = await fetch('/api/workspace/write', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args),
            });
            result = writeRes.ok ? `Successfully wrote to ${call.args.name}` : 'Failed to write file';
            break;
          case 'read_file':
            const readRes = await fetch(`/api/workspace/read?name=${encodeURIComponent(call.args.name)}`);
            const readData = await readRes.json();
            result = readRes.ok ? `Content of ${call.args.name}:\n${readData.content}` : 'Failed to read file';
            break;
          case 'list_files':
            const listRes = await fetch('/api/workspace');
            const listData = await listRes.json();
            result = listRes.ok ? `Files in workspace:\n${listData.map((f: any) => f.name).join('\n')}` : 'Failed to list files';
            break;
          case 'delete_file':
            const delRes = await fetch(`/api/workspace/delete?name=${encodeURIComponent(call.args.name)}`, {
              method: 'DELETE'
            });
            result = delRes.ok ? `Successfully deleted ${call.args.name}` : 'Failed to delete file';
            break;
        }

        // Add tool result as a hidden system message or just inform the user
        toast.info(`Agent action: ${call.tool} on ${call.args.name || 'workspace'}`);
        
        // Optionally send the result back to the AI to continue the chain
        // For now, we'll just log it to the console and show a toast
        console.log(`Tool ${call.tool} result:`, result);
      } catch (error) {
        console.error(`Tool ${call.tool} execution failed`, error);
      }
    }
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
          ollamaUrl={ollamaUrl}
          setShowSettings={() => setCurrentView('settings')}
        />

        <div className="flex-1 overflow-y-auto">
          {currentView === 'chat' && (
            <ChatView 
              activeChatId={activeChatId}
              activeChat={activeChat}
              isLoading={isLoading}
              input={input}
              setInput={setInput}
              handleSendMessage={handleSendMessage}
              createNewChat={createNewChat}
              connectionStatus={connectionStatus}
              messagesEndRef={messagesEndRef}
            />
          )}
          
          {currentView === 'models' && (
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
          )}

          {currentView === 'pull' && (
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
          )}

          {currentView === 'workspace' && (
            <WorkspaceView />
          )}

          {currentView === 'settings' && (
            <SettingsView 
              ollamaUrl={ollamaUrl}
              setOllamaUrl={setOllamaUrl}
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
