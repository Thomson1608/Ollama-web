import React from 'react';
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
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/30 p-4 md:p-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto space-y-8"
      >
        <div className="flex items-center justify-between">
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
            onClick={saveSettings}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-200"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Connection Status */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div className="space-y-4">
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
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <UserCircle size={16} className="text-blue-500" />
                System Prompt
              </label>
              <textarea 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Tell the AI who you are and how it should behave..."
                rows={4}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
              />
            </div>

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
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-40 overflow-y-auto">
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
        </div>
      </motion.div>
    </div>
  );
};
