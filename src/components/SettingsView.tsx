import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Globe, 
  Terminal, 
  CheckCircle2, 
  AlertCircle,
  UserCircle,
  Brain,
  Trash2,
  Save,
  BarChart,
  Power,
  Activity,
  Cpu,
  Hash,
  Info,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { motion } from 'motion/react';
import { ConnectionStatus, Memory, ModelParameters } from '../types';
import { StatsView } from './StatsView';
import { MemoryEditor } from './MemoryEditor';
import { SystemControl } from './SystemControl';
import { SystemLogView } from './SystemLogView';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface SettingsViewProps {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  parameters: ModelParameters;
  setParameters: (params: ModelParameters) => void;
  ollamaUrl: string;
  setOllamaUrl: (url: string) => void;
  ollamaApiKey: string;
  setOllamaApiKey: (key: string) => void;
  memory: Memory;
  clearMemory: () => void;
  saveSettings: () => void;
  connectionStatus: ConnectionStatus;
  username?: string | null;
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
}

type TabType = 'general' | 'memory' | 'prompt' | 'model' | 'stats';

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemPrompt,
  setSystemPrompt,
  parameters,
  setParameters,
  ollamaUrl,
  setOllamaUrl,
  ollamaApiKey,
  setOllamaApiKey,
  memory,
  clearMemory,
  saveSettings,
  connectionStatus,
  username,
  theme,
  setTheme
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [localPrompt, setLocalPrompt] = useState(systemPrompt);
  const [localParameters, setLocalParameters] = useState<ModelParameters>(parameters);
  const [localOllamaUrl, setLocalOllamaUrl] = useState(ollamaUrl);
  const [localOllamaApiKey, setLocalOllamaApiKey] = useState(ollamaApiKey);
  const [localMemory, setLocalMemory] = useState<string[]>(memory.facts);
  const [isConfirmingShutdown, setIsConfirmingShutdown] = useState(false);
  
  const hasChanges = 
    localPrompt !== systemPrompt || 
    localOllamaUrl !== ollamaUrl ||
    localOllamaApiKey !== ollamaApiKey ||
    JSON.stringify(localMemory) !== JSON.stringify(memory.facts) ||
    JSON.stringify(localParameters) !== JSON.stringify(parameters);

  // Update local state if parent state changes (e.g. on initial load)
  useEffect(() => {
    setLocalPrompt(systemPrompt);
    setLocalMemory(memory.facts);
    setLocalParameters(parameters);
    setLocalOllamaUrl(ollamaUrl);
    setLocalOllamaApiKey(ollamaApiKey);
  }, [systemPrompt, memory, parameters, ollamaUrl, ollamaApiKey]);

  const handleSave = () => {
    setSystemPrompt(localPrompt);
    setParameters(localParameters);
    setOllamaUrl(localOllamaUrl);
    setOllamaApiKey(localOllamaApiKey);
    // Update memory via API
    fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: localMemory }),
    }).then(() => {
        // We need a way to update parent state, but for now we just save and reload
        saveSettings();
    });
  };

  const updateParam = (key: keyof ModelParameters, value: any) => {
    setLocalParameters(prev => ({ ...prev, [key]: value }));
  };

  const handleShutdown = async () => {
    if (!isConfirmingShutdown) {
      setIsConfirmingShutdown(true);
      setTimeout(() => setIsConfirmingShutdown(false), 3000);
      return;
    }
    try {
      const res = await fetch('/api/system/shutdown', { 
        method: 'POST',
        headers: {
          'x-username': username || ''
        }
      });
      if (res.ok) {
        toast.success('System will shut down in 1 minute.');
      } else {
        toast.error('Failed to initiate shutdown.');
      }
    } catch (e) {
      toast.error('Error connecting to server.');
    }
    setIsConfirmingShutdown(false);
  };

  const tabs = [
    { id: 'general', label: 'General Setting', icon: Globe },
    { id: 'memory', label: 'Long-term Memory', icon: Brain },
    { id: 'prompt', label: 'System Prompt', icon: UserCircle },
    { id: 'model', label: 'Model Defaults', icon: Cpu },
    { id: 'stats', label: 'Chat Statistics', icon: BarChart },
    { id: 'logs', label: 'System Logs', icon: Terminal },
  ] as const;

  type TabType = typeof tabs[number]['id'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
      {/* Header - Fixed at top, Compact */}
      <div className="bg-bg-primary/80 backdrop-blur-md border-b border-border-primary px-4 py-2 z-10 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-primary/10 rounded-lg flex items-center justify-center text-accent-primary shadow-sm shrink-0">
              <Settings size={18} />
            </div>
            <div className="min-w-0 flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-text-primary truncate">Settings</h2>
              <p className="text-xs text-text-secondary truncate hidden md:block">Configure AI behavior</p>
            </div>
          </div>
          
          {/* Tabs inline with header on desktop */}
          <div className="flex overflow-x-auto hide-scrollbar gap-1 flex-1 md:justify-center">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                  activeTab === tab.id 
                    ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20" 
                    : "text-text-secondary hover:bg-bg-tertiary border border-transparent"
                )}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <button 
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 ${
              hasChanges 
                ? "bg-accent-primary hover:bg-accent-primary/90 text-white shadow-accent-primary/20 cursor-pointer" 
                : "bg-bg-tertiary text-text-secondary cursor-not-allowed shadow-none"
            }`}
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      {/* Body - Scrollable, Full Width, Top-Left Aligned */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar">
        <motion.div 
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full pb-12"
        >
          {activeTab === 'general' && (
            <div className="bg-bg-secondary p-6 rounded-xl border border-border-primary shadow-sm space-y-8 flex flex-col">
              <div className="space-y-4 flex-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <Globe size={16} className="text-accent-primary" />
                    Ollama Server Status
                  </label>
                  <div className="flex items-center gap-1.5">
                    {connectionStatus === 'connected' ? (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                        <CheckCircle2 size={10} />
                        CONNECTED
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                        <AlertCircle size={10} />
                        DISCONNECTED
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-text-secondary">Ollama API URL</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={localOllamaUrl}
                      onChange={(e) => setLocalOllamaUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="flex-1 bg-bg-primary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-accent-primary/20 outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-text-secondary">
                    Địa chỉ URL của máy chủ Ollama. Mặc định là http://localhost:11434.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-text-secondary">Ollama API Key</label>
                  <div className="flex gap-2">
                    <input 
                      type="password"
                      value={localOllamaApiKey}
                      onChange={(e) => setLocalOllamaApiKey(e.target.value)}
                      placeholder="Nhập API Key..."
                      className="flex-1 bg-bg-primary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-accent-primary/20 outline-none"
                    />
                  </div>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed">
                  The application is configured to connect to Ollama via the backend server. 
                  {connectionStatus === 'connected' 
                    ? " The connection is currently active and healthy." 
                    : " The backend is unable to reach Ollama. Please ensure Ollama is running on the server."}
                </p>
              </div>

              {/* Theme Selection */}
              <div className="space-y-4 pt-6 border-t border-border-primary">
                <label className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Sun size={16} className="text-accent-primary" />
                  Appearance Theme
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'system', label: 'System', icon: Monitor }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as any)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                        theme === t.id 
                          ? "bg-accent-primary/10 border-accent-primary text-accent-primary shadow-sm" 
                          : "bg-bg-primary border-border-primary text-text-secondary hover:border-text-secondary/30"
                      )}
                    >
                      <t.icon size={20} />
                      <span className="text-xs font-bold">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-accent-primary/10 rounded-xl border border-accent-primary/20 space-y-3">
                <div className="flex items-center gap-2 text-accent-primary font-bold text-sm">
                  <Terminal size={16} />
                  Server-Side Logic
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  All AI processing and model management are now handled by the backend server for improved security and reliability when deployed on a VPS.
                </p>
              </div>

              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                    <Power size={16} />
                    System Power
                  </div>
                  <button
                    onClick={handleShutdown}
                    className={`text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm flex items-center gap-2 ${
                      isConfirmingShutdown 
                        ? "bg-red-500 hover:bg-red-600 text-white" 
                        : "bg-bg-secondary text-red-400 border border-red-500/20 hover:bg-red-500/10"
                    }`}
                  >
                    <Power size={14} />
                    {isConfirmingShutdown ? "Click to Confirm Shutdown" : "Shutdown Server (1 Min)"}
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  This will schedule a full system shutdown in 1 minute. Use this if you are running the application on a dedicated machine or VPS and want to power it off.
                </p>
              </div>

              <div className="pt-6 border-t border-border-primary">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 bg-accent-primary/10 rounded-lg flex items-center justify-center text-accent-primary">
                    <Activity size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary">System Control & Monitoring</h3>
                </div>
                <SystemControl username={username} />
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="bg-bg-secondary p-6 rounded-3xl border border-border-primary shadow-sm space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <Brain size={16} className="text-accent-primary" />
                    Long-term Memory
                  </label>
                  {memory.facts.length > 0 && (
                    <button 
                      onClick={clearMemory}
                      className="text-[10px] font-bold text-red-400 hover:text-red-500 flex items-center gap-1"
                    >
                      <Trash2 size={10} />
                      CLEAR
                    </button>
                  )}
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Information the AI has learned about you over time. This is used to personalize your experience.
                </p>
                <MemoryEditor 
                  facts={localMemory} 
                  onChange={setLocalMemory} 
                />
              </div>
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="bg-bg-secondary p-8 rounded-3xl border border-border-primary shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <label className="text-base font-bold text-text-primary flex items-center gap-2">
                  <UserCircle size={20} className="text-accent-primary" />
                  System Prompt
                </label>
                {hasChanges && (
                  <span className="text-[10px] font-bold text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full border border-accent-primary/20 animate-pulse">
                    UNSAVED CHANGES
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Define the AI's personality, knowledge boundaries, and response style. This prompt is sent with every message to guide the AI's behavior.
              </p>
              <textarea 
                value={localPrompt}
                onChange={(e) => setLocalPrompt(e.target.value)}
                placeholder="Tell the AI who you are and how it should behave..."
                className="w-full bg-bg-primary border border-border-primary rounded-2xl px-6 py-5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all text-sm font-mono min-h-[400px] leading-relaxed no-scrollbar"
              />
            </div>
          )}

          {activeTab === 'model' && (
            <div className="bg-bg-secondary p-8 rounded-3xl border border-border-primary shadow-sm space-y-8">
              <div className="flex items-center justify-between">
                <label className="text-base font-bold text-text-primary flex items-center gap-2">
                  <Cpu size={20} className="text-accent-primary" />
                  Model Default Parameters
                </label>
                {hasChanges && (
                  <span className="text-[10px] font-bold text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full border border-accent-primary/20 animate-pulse">
                    UNSAVED CHANGES
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Temperature */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                      Temperature
                      <Info size={14} className="text-text-secondary cursor-help" />
                    </label>
                    <span className="text-xs font-mono bg-bg-tertiary px-1.5 py-0.5 rounded text-text-primary">
                      {(localParameters.temperature ?? 0.7).toFixed(1)}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.1"
                    value={localParameters.temperature ?? 0.7}
                    onChange={(e) => updateParam('temperature', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
                  />
                </div>

                {/* Top P */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                      Top P
                      <Info size={14} className="text-text-secondary cursor-help" />
                    </label>
                    <span className="text-xs font-mono bg-bg-tertiary px-1.5 py-0.5 rounded text-text-primary">
                      {(localParameters.topP ?? 0.9).toFixed(2)}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={localParameters.topP ?? 0.9}
                    onChange={(e) => updateParam('topP', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
                  />
                </div>

                {/* Top K */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                      Top K
                      <Info size={14} className="text-text-secondary cursor-help" />
                    </label>
                    <span className="text-xs font-mono bg-bg-tertiary px-1.5 py-0.5 rounded text-text-primary">
                      {localParameters.topK ?? 40}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="100" 
                    step="1"
                    value={localParameters.topK ?? 40}
                    onChange={(e) => updateParam('topK', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
                  />
                </div>

                {/* Max Tokens */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                      Max Tokens
                    </label>
                  </div>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
                    <input 
                      type="number" 
                      placeholder="Default"
                      value={localParameters.maxTokens ?? ''}
                      onChange={(e) => updateParam('maxTokens', e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full pl-10 pr-4 py-2 bg-bg-primary border border-border-primary rounded-xl text-sm text-text-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* JSON Mode */}
              <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-2xl border border-border-primary">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-bg-primary rounded-xl flex items-center justify-center text-accent-primary shadow-sm">
                    <Terminal size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">JSON Mode</h4>
                    <p className="text-[10px] text-text-secondary">Force the model to output valid JSON</p>
                  </div>
                </div>
                <button 
                  onClick={() => updateParam('jsonMode', !localParameters.jsonMode)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    localParameters.jsonMode ? "bg-accent-primary" : "bg-bg-tertiary border border-border-primary"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    localParameters.jsonMode ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="bg-bg-secondary rounded-3xl border border-border-primary shadow-sm overflow-hidden">
              <StatsView />
            </div>
          )}

          {activeTab === 'logs' && (
            <SystemLogView />
          )}
        </motion.div>
      </div>
    </div>
  );
};
