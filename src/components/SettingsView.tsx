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
  Info
} from 'lucide-react';
import { motion } from 'motion/react';
import { ConnectionStatus, Memory, ModelParameters } from '../types';
import { StatsView } from './StatsView';
import { MemoryEditor } from './MemoryEditor';
import { SystemControl } from './SystemControl';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface SettingsViewProps {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  parameters: ModelParameters;
  setParameters: (params: ModelParameters) => void;
  memory: Memory;
  clearMemory: () => void;
  saveSettings: () => void;
  connectionStatus: ConnectionStatus;
  username?: string | null;
}

type TabType = 'general' | 'memory' | 'prompt' | 'model' | 'stats';

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemPrompt,
  setSystemPrompt,
  parameters,
  setParameters,
  memory,
  clearMemory,
  saveSettings,
  connectionStatus,
  username
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [localPrompt, setLocalPrompt] = useState(systemPrompt);
  const [localParameters, setLocalParameters] = useState<ModelParameters>(parameters);
  const [localMemory, setLocalMemory] = useState<string[]>(memory.facts);
  const [isConfirmingShutdown, setIsConfirmingShutdown] = useState(false);
  
  const hasChanges = 
    localPrompt !== systemPrompt || 
    JSON.stringify(localMemory) !== JSON.stringify(memory.facts) ||
    JSON.stringify(localParameters) !== JSON.stringify(parameters);

  // Update local state if parent state changes (e.g. on initial load)
  useEffect(() => {
    setLocalPrompt(systemPrompt);
    setLocalMemory(memory.facts);
    setLocalParameters(parameters);
  }, [systemPrompt, memory, parameters]);

  const handleSave = () => {
    setSystemPrompt(localPrompt);
    setParameters(localParameters);
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
      const res = await fetch('/api/system/shutdown', { method: 'POST' });
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
  ] as const;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30">
      {/* Header - Fixed at top */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 md:px-8 py-4 md:py-6 z-10 shrink-0">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-xl md:rounded-2xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
              <Settings size={20} className="md:hidden" />
              <Settings size={24} className="hidden md:block" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-bold text-gray-800 truncate">Settings</h2>
              <p className="text-[10px] md:text-sm text-gray-500 truncate">Configure AI behavior</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all shadow-lg w-full md:w-auto ${
              hasChanges 
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 cursor-pointer" 
                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
            }`}
          >
            <Save size={16} className="md:hidden" />
            <Save size={18} className="hidden md:block" />
            Save Changes
          </button>
        </div>
        
        {/* Tabs */}
        <div className="max-w-4xl mx-auto mt-4 md:mt-6 flex overflow-x-auto hide-scrollbar gap-1.5 md:gap-2 pb-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-[11px] md:text-sm font-medium transition-colors whitespace-nowrap shrink-0",
                activeTab === tab.id 
                  ? "bg-blue-50 text-blue-700 border border-blue-100" 
                  : "text-gray-600 hover:bg-gray-100 border border-transparent"
              )}
            >
              <tab.icon size={14} className="md:hidden" />
              <tab.icon size={16} className="hidden md:block" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <motion.div 
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="max-w-4xl mx-auto pb-12"
        >
          {activeTab === 'general' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6 flex flex-col">
              <div className="space-y-4 flex-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Globe size={16} className="text-blue-500" />
                    Ollama Server Status
                  </label>
                  <div className="flex items-center gap-1.5">
                    {connectionStatus === 'connected' ? (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                        <CheckCircle2 size={10} />
                        CONNECTED
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                        <AlertCircle size={10} />
                        DISCONNECTED
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  The application is configured to connect to Ollama via the backend server. 
                  {connectionStatus === 'connected' 
                    ? " The connection is currently active and healthy." 
                    : " The backend is unable to reach Ollama. Please ensure Ollama is running on the server."}
                </p>
              </div>

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
                  <Terminal size={16} />
                  Server-Side Logic
                </div>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  All AI processing and model management are now handled by the backend server for improved security and reliability when deployed on a VPS.
                </p>
              </div>

              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                    <Power size={16} />
                    System Power
                  </div>
                  <button
                    onClick={handleShutdown}
                    className={`text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm flex items-center gap-2 ${
                      isConfirmingShutdown 
                        ? "bg-red-600 hover:bg-red-700 text-white" 
                        : "bg-white text-red-600 border border-red-200 hover:bg-red-50"
                    }`}
                  >
                    <Power size={14} />
                    {isConfirmingShutdown ? "Click to Confirm Shutdown" : "Shutdown Server (1 Min)"}
                  </button>
                </div>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  This will schedule a full system shutdown in 1 minute. Use this if you are running the application on a dedicated machine or VPS and want to power it off.
                </p>
              </div>

              <div className="pt-6 border-t border-gray-50">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <Activity size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800">System Control & Monitoring</h3>
                </div>
                <SystemControl username={username} />
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Brain size={16} className="text-blue-500" />
                    Long-term Memory
                  </label>
                  {memory.facts.length > 0 && (
                    <button 
                      onClick={clearMemory}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 size={10} />
                      CLEAR
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
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
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <label className="text-base font-bold text-gray-700 flex items-center gap-2">
                  <UserCircle size={20} className="text-blue-500" />
                  System Prompt
                </label>
                {hasChanges && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 animate-pulse">
                    UNSAVED CHANGES
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Define the AI's personality, knowledge boundaries, and response style. This prompt is sent with every message to guide the AI's behavior.
              </p>
              <textarea 
                value={localPrompt}
                onChange={(e) => setLocalPrompt(e.target.value)}
                placeholder="Tell the AI who you are and how it should behave..."
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-6 py-5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono min-h-[400px] leading-relaxed"
              />
            </div>
          )}

          {activeTab === 'model' && (
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-center justify-between">
                <label className="text-base font-bold text-gray-700 flex items-center gap-2">
                  <Cpu size={20} className="text-blue-500" />
                  Model Default Parameters
                </label>
                {hasChanges && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 animate-pulse">
                    UNSAVED CHANGES
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Temperature */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      Temperature
                      <Info size={14} className="text-gray-400 cursor-help" />
                    </label>
                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
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
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Top P */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      Top P
                      <Info size={14} className="text-gray-400 cursor-help" />
                    </label>
                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
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
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Top K */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      Top K
                      <Info size={14} className="text-gray-400 cursor-help" />
                    </label>
                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
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
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Max Tokens */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      Max Tokens
                    </label>
                  </div>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="number" 
                      placeholder="Default"
                      value={localParameters.maxTokens ?? ''}
                      onChange={(e) => updateParam('maxTokens', e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* JSON Mode */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                    <Terminal size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">JSON Mode</h4>
                    <p className="text-[10px] text-gray-500">Force the model to output valid JSON</p>
                  </div>
                </div>
                <button 
                  onClick={() => updateParam('jsonMode', !localParameters.jsonMode)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    localParameters.jsonMode ? "bg-blue-600" : "bg-gray-300"
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
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <StatsView />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
