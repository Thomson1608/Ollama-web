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
import { SettingsModal } from './components/SettingsModal';
import { Chat, Message, OllamaModel, RunningModel, ViewType, ConnectionStatus } from './types';

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('ollama_chats');
    return saved ? JSON.parse(saved) : [];
  });
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
  const [showSettings, setShowSettings] = useState(false);
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

  const saveSettings = () => {
    setShowSettings(false);
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
        setShowSettings={setShowSettings}
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
          setShowSettings={setShowSettings}
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
        </div>
      </main>

      <SettingsModal 
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        ollamaUrl={ollamaUrl}
        setOllamaUrl={setOllamaUrl}
        saveSettings={saveSettings}
        connectionStatus={connectionStatus}
      />
    </div>
  );
}
