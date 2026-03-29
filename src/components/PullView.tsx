import React from 'react';
import { 
  Download, 
  RefreshCw, 
  Plus, 
  X, 
  Cpu, 
  ExternalLink 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface PullViewProps {
  newModelName: string;
  setNewModelName: (name: string) => void;
  pullModel: (nameOverride?: string) => void;
  pullingModel: { name: string; progress: number; status: string } | null;
  cancelPull: () => void;
  showSuggestions: boolean;
  setShowSuggestions: (show: boolean) => void;
  suggestions: string[];
  popularModels: { name: string; description: string; type: string }[];
  modelFilter: 'local' | 'claude' | 'cloud-local';
  setModelFilter: (filter: 'local' | 'claude' | 'cloud-local') => void;
  claudeUsage: { used: number; total: number };
}

export const PullView: React.FC<PullViewProps> = ({
  newModelName,
  setNewModelName,
  pullModel,
  pullingModel,
  cancelPull,
  showSuggestions,
  setShowSuggestions,
  suggestions,
  popularModels,
  modelFilter,
  setModelFilter,
  claudeUsage
}) => {
  const filteredModels = popularModels.filter(m => m.type === modelFilter);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Filter Tabs */}
      <div className="flex p-1 bg-gray-100 rounded-2xl w-fit mx-auto">
        <button
          onClick={() => setModelFilter('local')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            modelFilter === 'local' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Local Models (Ollama)
        </button>
        <button
          onClick={() => setModelFilter('cloud-local')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            modelFilter === 'cloud-local' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Cloud-Local Models
        </button>
        <button
          onClick={() => setModelFilter('claude')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            modelFilter === 'claude' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Claude Models (API)
        </button>
      </div>

      {modelFilter === 'claude' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                <Cpu size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Claude API Usage</h3>
                <p className="text-xs text-gray-500">Token consumption for the current session</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-purple-600">
                {claudeUsage.used.toLocaleString()} / {claudeUsage.total.toLocaleString()} tokens
              </span>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-500" 
              style={{ width: `${(claudeUsage.used / claudeUsage.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-800">
            {modelFilter === 'local' ? 'Pull New Model' : 'Connect Claude Model'}
          </h2>
          <p className="text-gray-500">
            {modelFilter === 'local' 
              ? 'Enter a model name from the Ollama library to download it to your machine.'
              : 'Select a Claude model to use via Anthropic API. Ensure your API key is configured.'}
          </p>
        </div>
        
        {modelFilter === 'local' ? (
          <div className="flex flex-col sm:flex-row gap-3 relative">
            <div className="relative flex-1">
              <Download className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text" 
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                onFocus={() => newModelName.trim().length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="e.g. llama3.2, mistral, codellama..."
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              
              {/* Suggestions Dropdown */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 overflow-hidden"
                  >
                    <div className="p-2 border-b border-gray-50 bg-gray-50/50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">Suggestions</span>
                    </div>
                    <div className="max-height-[300px] overflow-y-auto">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => pullModel(suggestion)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 text-left transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <Cpu size={16} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{suggestion}</span>
                          </div>
                          <Download size={14} className="text-gray-300 group-hover:text-blue-400" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={() => pullModel()}
              disabled={!newModelName.trim() || !!pullingModel}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white px-8 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 disabled:shadow-none"
            >
              {pullingModel ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
              {pullingModel ? 'Pulling...' : 'Pull Model'}
            </button>
          </div>
        ) : (
          <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                <ExternalLink size={20} />
              </div>
              <p className="text-sm font-medium text-purple-900">Claude models are accessed via API. No download required.</p>
            </div>
          </div>
        )}

        {pullingModel && modelFilter === 'local' && (
          <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <RefreshCw size={20} className="animate-spin" />
                </div>
                <div>
                  <p className="font-bold text-blue-900">Downloading {pullingModel.name}</p>
                  <p className="text-xs text-blue-700">{pullingModel.status}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={cancelPull}
                  className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-100 rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5"
                >
                  <X size={14} />
                  CANCEL
                </button>
                <span className="text-xl font-mono font-bold text-blue-600">{pullingModel.progress.toFixed(1)}%</span>
              </div>
            </div>
            <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${pullingModel.progress}%` }}
                className="h-full bg-blue-600"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-bold text-gray-800">
            {modelFilter === 'local' ? 'Popular Local Models' : 'Claude Models'}
          </h3>
          {modelFilter === 'local' && (
            <a 
              href="https://ollama.com/library" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              Browse Library <ExternalLink size={14} />
            </a>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredModels.map(model => (
            <button
              key={model.name}
              onClick={() => {
                if (model.type === 'local') {
                  setNewModelName(model.name);
                } else {
                  // For Claude, we might just select it directly or show a message
                  toast.info(`Selected Claude model: ${model.name}`);
                }
              }}
              className={`p-5 rounded-3xl border transition-all text-left group ${
                model.type === 'local' 
                  ? 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md' 
                  : 'bg-purple-50/30 border-purple-100 hover:border-purple-300 hover:shadow-md'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors mb-4 ${
                model.type === 'local' 
                  ? 'bg-gray-50 group-hover:bg-blue-50 text-gray-400 group-hover:text-blue-500' 
                  : 'bg-purple-100 group-hover:bg-purple-200 text-purple-400 group-hover:text-purple-600'
              }`}>
                <Cpu size={20} />
              </div>
              <h4 className="font-bold text-gray-800 mb-1">{model.name}</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{model.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
