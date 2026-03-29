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
  Save
} from 'lucide-react';
import { motion } from 'motion/react';
import { ConnectionStatus, Memory } from '../types';

interface SettingsViewProps {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  memory: Memory;
  clearMemory: () => void;
  saveSettings: () => void;
  connectionStatus: ConnectionStatus;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemPrompt,
  setSystemPrompt,
  memory,
  clearMemory,
  saveSettings,
  connectionStatus
}) => {
  const [localPrompt, setLocalPrompt] = useState(systemPrompt);
  const [localMemory, setLocalMemory] = useState<string[]>(memory.facts);
  const hasChanges = localPrompt !== systemPrompt || JSON.stringify(localMemory) !== JSON.stringify(memory.facts);

  // Update local state if parent state changes (e.g. on initial load)
  useEffect(() => {
    setLocalPrompt(systemPrompt);
    setLocalMemory(memory.facts);
  }, [systemPrompt, memory]);

  const handleSave = () => {
    setSystemPrompt(localPrompt);
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30">
      {/* Header - Fixed at top */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 md:px-8 py-6 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
              <p className="text-sm text-gray-500">Configure your Ollama connection and AI behavior</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg ${
              hasChanges 
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 cursor-pointer" 
                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
            }`}
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>

      {/* Body - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto space-y-8 pb-12"
        >
          <div className="space-y-6">
            {/* System Prompt - Full Width */}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Connection Status */}
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
              </div>

              {/* Memory & Personalization */}
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
                  <textarea
                    value={localMemory.join('\n')}
                    onChange={(e) => setLocalMemory(e.target.value.split('\n').filter(line => line.trim() !== ''))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 font-mono h-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Enter facts about yourself, one per line..."
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
