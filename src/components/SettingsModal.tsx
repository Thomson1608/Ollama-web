import React from 'react';
import { 
  X, 
  Settings, 
  Globe, 
  Terminal, 
  CheckCircle2, 
  AlertCircle,
  UserCircle,
  Brain,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConnectionStatus, Memory } from '../types';

interface SettingsModalProps {
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  ollamaUrl: string;
  setOllamaUrl: (url: string) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  memory: Memory;
  clearMemory: () => void;
  saveSettings: () => void;
  connectionStatus: ConnectionStatus;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  showSettings,
  setShowSettings,
  ollamaUrl,
  setOllamaUrl,
  systemPrompt,
  setSystemPrompt,
  memory,
  clearMemory,
  saveSettings,
  connectionStatus
}) => {
  return (
    <AnimatePresence>
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <Settings size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Settings</h2>
                  <p className="text-xs text-gray-500">Configure your Ollama connection</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Globe size={16} className="text-blue-500" />
                    Ollama Server URL
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
                <input 
                  type="text" 
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm"
                />
                <p className="text-xs text-gray-400 italic">Default is http://localhost:11434</p>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <UserCircle size={16} className="text-blue-500" />
                  Personalization (System Prompt)
                </label>
                <textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Tell the AI who you are and how it should behave (e.g., 'I am a software engineer, be concise and technical')."
                  rows={4}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
                />
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  This information will be sent to the AI model with every message to help it understand your context and preferences.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Brain size={16} className="text-blue-500" />
                    Long-term Memory (Extracted Facts)
                  </label>
                  {memory.facts.length > 0 && (
                    <button 
                      onClick={clearMemory}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 size={10} />
                      CLEAR MEMORY
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
                    <p className="text-xs text-gray-400 italic">No facts extracted yet. Chat with the AI to build memory.</p>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  The AI automatically extracts facts about you from conversations to provide more personalized responses in the future.
                </p>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                  <Terminal size={16} />
                  CORS Configuration Required
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  To allow this web UI to communicate with your local Ollama, you must set the <code className="bg-amber-100 px-1 rounded font-bold">OLLAMA_ORIGINS</code> environment variable.
                </p>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">macOS / Linux</p>
                  <code className="block w-full bg-white/50 border border-amber-200 p-2 rounded text-[10px] font-mono text-amber-900 break-all">
                    export OLLAMA_ORIGINS="*" && ollama serve
                  </code>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Windows (PowerShell)</p>
                  <code className="block w-full bg-white/50 border border-amber-200 p-2 rounded text-[10px] font-mono text-amber-900 break-all">
                    $env:OLLAMA_ORIGINS="*"; ollama serve
                  </code>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveSettings}
                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-200"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
