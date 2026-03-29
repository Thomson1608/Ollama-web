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
  claudeUsage: { used: number; total: number };
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemPrompt,
  setSystemPrompt,
  memory,
  clearMemory,
  saveSettings,
  connectionStatus,
  claudeUsage
}) => {
  const [localPrompt, setLocalPrompt] = useState(systemPrompt);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const hasChanges = localPrompt !== systemPrompt;

  // Update local state if parent state changes (e.g. on initial load)
  useEffect(() => {
    setLocalPrompt(systemPrompt);
    fetch('/api/secrets')
      .then(res => res.json())
      .then(data => setClaudeApiKey(data.ANTHROPIC_API_KEY))
      .catch(console.error);
  }, [systemPrompt]);

  const handleSave = () => {
    setSystemPrompt(localPrompt);
    saveSettings();
  };

  const handleSaveApiKey = async () => {
    try {
      await fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ANTHROPIC_API_KEY: claudeApiKey }),
      });
      alert('API Key saved successfully!');
    } catch (error) {
      alert('Failed to save API Key.');
    }
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
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 h-[180px] overflow-y-auto">
                    {memory.facts.length > 0 ? (
                      <ul className="space-y-2">
                        {memory.facts.map((fact, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2">
                            <span className="text-blue-400">•</span>
                            {fact}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No facts extracted yet.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Cloud Services Section */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Globe size={16} className="text-purple-500" />
                    Cloud AI Services
                  </label>
                  <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-purple-100">
                    ACTIVE
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                        <div className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                          <Brain size={14} />
                        </div>
                        Anthropic Claude
                      </div>
                      <span className="text-[10px] font-bold text-purple-600">{claudeApiKey ? 'API CONFIGURED' : 'API NOT SET'}</span>
                    </div>
                    
                    <div className="space-y-3">
                      <input 
                        type="password"
                        value={claudeApiKey}
                        onChange={(e) => setClaudeApiKey(e.target.value)}
                        placeholder="Enter your Anthropic API Key"
                        className="w-full bg-white border border-purple-200 rounded-xl px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                      <button
                        onClick={handleSaveApiKey}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-2 rounded-xl transition-all"
                      >
                        Save API Key
                      </button>
                    </div>

                    <div className="space-y-2 mt-4">
                      <div className="flex justify-between text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                        <span>Token Usage</span>
                        <span>{Math.round((claudeUsage.used / claudeUsage.total) * 100)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-purple-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 transition-all duration-500"
                          style={{ width: `${(claudeUsage.used / claudeUsage.total) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-purple-500">
                        <span>{claudeUsage.used.toLocaleString()} used</span>
                        <span>{claudeUsage.total.toLocaleString()} total</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-700 font-bold text-sm mb-2">
                      <Settings size={14} />
                      Cloud vs Local
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      Local models run on your hardware via Ollama. Cloud models (Claude) run on Anthropic's servers and require an API key. 
                      Cloud models generally offer higher intelligence but consume API tokens.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
