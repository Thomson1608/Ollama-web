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
  modelFilter: 'local' | 'cloud-local';
  setModelFilter: (filter: 'local' | 'cloud-local') => void;
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
  setModelFilter
}) => {
  const filteredModels = popularModels.filter(m => m.type === modelFilter);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Filter Tabs */}
      <div className="flex p-1 bg-bg-secondary rounded-2xl w-fit border border-border-primary">
        <button
          onClick={() => setModelFilter('local')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            modelFilter === 'local' ? 'bg-bg-primary text-accent-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Local Models (Ollama)
        </button>
        <button
          onClick={() => setModelFilter('cloud-local')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            modelFilter === 'cloud-local' ? 'bg-bg-primary text-accent-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Cloud-Local Models
        </button>
      </div>

      <div className="bg-bg-secondary p-8 rounded-3xl border border-border-primary shadow-sm space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">
            Pull New Model
          </h2>
          <p className="text-text-secondary">
            Enter a model name from the Ollama library to download it to your machine.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 relative">
          <div className="relative flex-1">
            <Download className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
            <input 
              type="text" 
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onFocus={() => newModelName.trim().length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="e.g. llama3.2, mistral, codellama..."
              className="w-full bg-bg-primary border border-border-primary rounded-2xl pl-12 pr-4 py-4 text-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all"
            />
            
            {/* Suggestions Dropdown */}
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute left-0 right-0 top-full mt-2 bg-bg-secondary border border-border-primary rounded-2xl shadow-xl z-20 overflow-hidden"
                >
                  <div className="p-2 border-b border-border-primary bg-bg-tertiary/50">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider px-2">Suggestions</span>
                  </div>
                  <div className="max-height-[300px] overflow-y-auto">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => pullModel(suggestion)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent-primary/10 text-left transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <Cpu size={16} className="text-text-secondary group-hover:text-accent-primary" />
                          <span className="text-sm font-medium text-text-primary group-hover:text-accent-primary">{suggestion}</span>
                        </div>
                        <Download size={14} className="text-text-secondary group-hover:text-accent-primary" />
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
            className="bg-accent-primary hover:bg-accent-primary/90 disabled:bg-bg-tertiary text-white px-8 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-primary/20 disabled:shadow-none"
          >
            {pullingModel ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
            {pullingModel ? 'Pulling...' : 'Pull Model'}
          </button>
        </div>

        {pullingModel && modelFilter === 'local' && (
          <div className="p-6 bg-accent-primary/10 rounded-2xl border border-accent-primary/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent-primary/20 rounded-xl flex items-center justify-center text-accent-primary">
                  <RefreshCw size={20} className="animate-spin" />
                </div>
                <div>
                  <p className="font-bold text-text-primary">Downloading {pullingModel.name}</p>
                  <p className="text-xs text-accent-primary">{pullingModel.status}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={cancelPull}
                  className="px-3 py-1.5 bg-bg-secondary hover:bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5"
                >
                  <X size={14} />
                  CANCEL
                </button>
                <span className="text-xl font-mono font-bold text-accent-primary">{pullingModel.progress.toFixed(1)}%</span>
              </div>
            </div>
            <div className="w-full h-3 bg-bg-tertiary rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${pullingModel.progress}%` }}
                className="h-full bg-accent-primary"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-bold text-text-primary">
            Popular Local Models
          </h3>
          <a 
            href="https://ollama.com/library" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-accent-primary hover:underline flex items-center gap-1"
          >
            Browse Library <ExternalLink size={14} />
          </a>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredModels.map(model => (
            <button
              key={model.name}
              onClick={() => {
                setNewModelName(model.name);
              }}
              className="p-5 rounded-3xl border bg-bg-secondary border-border-primary hover:border-accent-primary/50 hover:shadow-md transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors mb-4 bg-bg-tertiary group-hover:bg-accent-primary/10 text-text-secondary group-hover:text-accent-primary">
                <Cpu size={20} />
              </div>
              <h4 className="font-bold text-text-primary mb-1">{model.name}</h4>
              <p className="text-xs text-text-secondary leading-relaxed">{model.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
