import React from 'react';
import { 
  Cpu, 
  Trash2, 
  Search,
  Globe,
  Square,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { OllamaModel, RunningModel, ConnectionStatus } from '../types';

interface ModelsViewProps {
  models: OllamaModel[];
  runningModels: RunningModel[];
  connectionStatus: ConnectionStatus;
  modelSearchQuery: string;
  setModelSearchQuery: (query: string) => void;
  deleteModel: (name: string) => void;
  stopModel: (name: string) => void;
  isStoppingModel: string | null;
  setSelectedModel: (model: string) => void;
  setCurrentView: (view: 'chat' | 'models' | 'pull') => void;
  activeChatId: string | null;
  createNewChat: () => void;
  formatSize: (size: number) => string;
  modelFilter: 'local' | 'cloud-local';
  setModelFilter: (filter: 'local' | 'cloud-local') => void;
  popularModels: any[];
}

export const ModelsView: React.FC<ModelsViewProps> = ({
  models,
  runningModels,
  connectionStatus,
  modelSearchQuery,
  setModelSearchQuery,
  deleteModel,
  stopModel,
  isStoppingModel,
  setSelectedModel,
  setCurrentView,
  activeChatId,
  createNewChat,
  formatSize,
  modelFilter,
  setModelFilter,
  popularModels
}) => {
  const localModels = models.filter(m => !m.name.includes(':cloud') && m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()));
  const cloudLocalModels = models.filter(m => m.name.includes(':cloud') && m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Filter Tabs */}
      <div className="flex p-1 bg-bg-secondary border border-border-primary rounded-2xl w-fit">
        <button
          onClick={() => setModelFilter('local')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            modelFilter === 'local' 
              ? "bg-bg-primary text-accent-primary shadow-sm" 
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Local Models (Ollama)
        </button>
        <button
          onClick={() => setModelFilter('cloud-local')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            modelFilter === 'cloud-local' 
              ? "bg-bg-primary text-accent-primary shadow-sm" 
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Cloud-Local Models
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-secondary p-6 rounded-3xl border border-border-primary">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-text-primary">
            {modelFilter === 'local' ? 'Installed Local Models' : 'Available Cloud Models'}
          </h2>
          <p className="text-sm text-text-secondary">
            {modelFilter === 'local' 
              ? 'Manage your locally downloaded Ollama models' 
              : 'Access Ollama cloud models'}
          </p>
        </div>
        {modelFilter === 'local' && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
            <input 
              type="text" 
              value={modelSearchQuery}
              onChange={(e) => setModelSearchQuery(e.target.value)}
              placeholder="Search installed models..."
              className="w-full bg-bg-tertiary border border-border-primary rounded-xl pl-10 pr-4 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modelFilter === 'local' ? (
          <>
            {localModels.length === 0 && connectionStatus === 'connected' && (
              <div className="col-span-full py-20 text-center text-text-secondary">
                {modelSearchQuery ? `No models matching "${modelSearchQuery}"` : "No models installed yet."}
              </div>
            )}
            {localModels.map(model => {
              const isRunning = runningModels.some(rm => rm.name === model.name || rm.model === model.name);
              const isStopping = isStoppingModel === model.name;

              return (
                <div key={model.digest} className={cn(
                  "bg-bg-secondary p-5 rounded-3xl border transition-all group relative",
                  isRunning ? "border-green-500/50 bg-green-500/5" : "border-border-primary hover:border-accent-primary/50"
                )}>
                  {isRunning && (
                    <div className="absolute top-4 right-12 flex items-center gap-1.5 bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-[10px] font-bold animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {isStopping ? 'STOPPING...' : 'RUNNING'}
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      isRunning ? "bg-green-500/20 text-green-400" : "bg-bg-tertiary text-text-secondary"
                    )}>
                      <Cpu size={20} />
                    </div>
                    <div className="flex gap-1">
                      {isRunning && (
                        <button 
                          onClick={() => stopModel(model.name)}
                          disabled={isStopping}
                          className="p-2 hover:bg-orange-500/10 text-text-secondary hover:text-orange-400 rounded-lg transition-colors disabled:opacity-50"
                          title="Stop Model"
                        >
                          {isStopping ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
                        </button>
                      )}
                      <button 
                        onClick={() => deleteModel(model.name)}
                        className="p-2 hover:bg-red-500/10 text-text-secondary hover:text-red-400 rounded-lg transition-colors"
                        title="Delete Model"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-bold text-text-primary mb-1 truncate pr-16" title={model.name}>{model.name}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-0.5 bg-bg-tertiary text-text-secondary rounded text-[10px] font-medium uppercase">
                      {model.details.parameter_size || 'Unknown'}
                    </span>
                    <span className="px-2 py-0.5 bg-bg-tertiary text-text-secondary rounded text-[10px] font-medium uppercase">
                      {model.details.quantization_level || 'Unknown'}
                    </span>
                    {(!model.name.toLowerCase().includes('flux') && 
                      !model.name.toLowerCase().includes('stable-diffusion') &&
                      !model.name.toLowerCase().includes('sdxl')) ? (
                      <span className="px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded text-[10px] font-bold uppercase">
                        Chat Support
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px] font-bold uppercase">
                        Image Model
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-secondary pt-4 border-t border-border-primary">
                    <span>{formatSize(model.size)}</span>
                    <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedModel(model.name)}
                    disabled={isStopping || (isRunning && isStoppingModel !== null)}
                    className={cn(
                      "w-full mt-4 py-2 rounded-xl text-xs font-bold transition-all border",
                      isRunning 
                        ? "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30" 
                        : "bg-bg-tertiary hover:bg-accent-primary/10 text-text-secondary hover:text-accent-primary border-transparent hover:border-accent-primary/30"
                    )}
                  >
                    {isRunning ? 'Currently Active' : 'Select for Chat'}
                  </button>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {cloudLocalModels.length === 0 && connectionStatus === 'connected' && (
              <div className="col-span-full py-20 text-center text-text-secondary">
                {modelSearchQuery ? `No cloud-local models matching "${modelSearchQuery}"` : "No cloud-local models installed yet."}
              </div>
            )}
            {cloudLocalModels.map(model => {
              const isRunning = runningModels.some(rm => rm.name === model.name || rm.model === model.name);
              const isStopping = isStoppingModel === model.name;

              return (
                <div key={model.digest} className={cn(
                  "bg-bg-secondary p-5 rounded-3xl border transition-all group relative",
                  isRunning ? "border-green-500/50 bg-green-500/5" : "border-border-primary hover:border-accent-primary/50"
                )}>
                  {isRunning && (
                    <div className="absolute top-4 right-12 flex items-center gap-1.5 bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-[10px] font-bold animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {isStopping ? 'STOPPING...' : 'RUNNING'}
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      isRunning ? "bg-green-500/20 text-green-400" : "bg-purple-500/20 text-purple-400"
                    )}>
                      <Globe size={20} />
                    </div>
                    <div className="flex gap-1">
                      {isRunning && (
                        <button 
                          onClick={() => stopModel(model.name)}
                          disabled={isStopping}
                          className="p-2 hover:bg-orange-500/10 text-text-secondary hover:text-orange-400 rounded-lg transition-colors disabled:opacity-50"
                          title="Stop Model"
                        >
                          {isStopping ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
                        </button>
                      )}
                      <button 
                        onClick={() => deleteModel(model.name)}
                        className="p-2 hover:bg-red-500/10 text-text-secondary hover:text-red-400 rounded-lg transition-colors"
                        title="Delete Model"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-bold text-text-primary mb-1 truncate pr-16" title={model.name}>{model.name}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px] font-medium uppercase">
                      Cloud-Local
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-secondary pt-4 border-t border-border-primary">
                    <span>{formatSize(model.size)}</span>
                    <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedModel(model.name)}
                    disabled={isStopping || (isRunning && isStoppingModel !== null)}
                    className={cn(
                      "w-full mt-4 py-2 rounded-xl text-xs font-bold transition-all border",
                      isRunning 
                        ? "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30" 
                        : "bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border-transparent hover:border-purple-500/40"
                    )}
                  >
                    {isRunning ? 'Currently Active' : 'Select for Chat'}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
