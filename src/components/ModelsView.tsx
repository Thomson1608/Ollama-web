import React from 'react';
import { 
  Cpu, 
  Trash2, 
  Search,
  Globe
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
  setSelectedModel: (model: string) => void;
  setCurrentView: (view: 'chat' | 'models' | 'pull') => void;
  activeChatId: string | null;
  createNewChat: () => void;
  formatSize: (size: number) => string;
  modelFilter: 'local' | 'claude' | 'cloud-local';
  setModelFilter: (filter: 'local' | 'claude' | 'cloud-local') => void;
  popularModels: any[];
}

export const ModelsView: React.FC<ModelsViewProps> = ({
  models,
  runningModels,
  connectionStatus,
  modelSearchQuery,
  setModelSearchQuery,
  deleteModel,
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
  const claudeModels = popularModels.filter(m => m.type === 'claude');

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Filter Tabs */}
      <div className="flex p-1 bg-gray-100 rounded-2xl w-fit">
        <button
          onClick={() => setModelFilter('local')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            modelFilter === 'local' 
              ? "bg-white text-blue-600 shadow-sm" 
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          Local Models (Ollama)
        </button>
        <button
          onClick={() => setModelFilter('cloud-local')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            modelFilter === 'cloud-local' 
              ? "bg-white text-blue-600 shadow-sm" 
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          Cloud-Local Models
        </button>
        <button
          onClick={() => setModelFilter('claude')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            modelFilter === 'claude' 
              ? "bg-white text-blue-600 shadow-sm" 
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          Cloud Models (Claude)
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-800">
            {modelFilter === 'local' ? 'Installed Local Models' : 'Available Cloud Models'}
          </h2>
          <p className="text-sm text-gray-500">
            {modelFilter === 'local' 
              ? 'Manage your locally downloaded Ollama models' 
              : 'Access powerful AI models via Anthropic API'}
          </p>
        </div>
        {modelFilter === 'local' && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              value={modelSearchQuery}
              onChange={(e) => setModelSearchQuery(e.target.value)}
              placeholder="Search installed models..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modelFilter === 'local' ? (
          <>
            {localModels.length === 0 && connectionStatus === 'connected' && (
              <div className="col-span-full py-20 text-center text-gray-400">
                {modelSearchQuery ? `No models matching "${modelSearchQuery}"` : "No models installed yet."}
              </div>
            )}
            {localModels.map(model => {
              const isRunning = runningModels.some(rm => rm.name === model.name || rm.model === model.name);
              return (
                <div key={model.digest} className={cn(
                  "bg-white p-5 rounded-3xl border transition-all group relative",
                  isRunning ? "border-green-200 shadow-md shadow-green-50" : "border-gray-200 shadow-sm hover:shadow-md"
                )}>
                  {isRunning && (
                    <div className="absolute top-4 right-12 flex items-center gap-1.5 bg-green-100 text-green-700 px-2 py-1 rounded-full text-[10px] font-bold animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      RUNNING
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      isRunning ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"
                    )}>
                      <Cpu size={20} />
                    </div>
                    <button 
                      onClick={() => deleteModel(model.name)}
                      className="p-2 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3 className="font-bold text-gray-800 mb-1 truncate pr-16" title={model.name}>{model.name}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                      {model.details.parameter_size || 'Unknown'}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                      {model.details.quantization_level || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 pt-4 border-t border-gray-50">
                    <span>{formatSize(model.size)}</span>
                    <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedModel(model.name);
                      setCurrentView('chat');
                      if (!activeChatId) createNewChat();
                    }}
                    className="w-full mt-4 py-2 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-blue-100"
                  >
                    Select for Chat
                  </button>
                </div>
              );
            })}
          </>
        ) : modelFilter === 'cloud-local' ? (
          <>
            {cloudLocalModels.length === 0 && connectionStatus === 'connected' && (
              <div className="col-span-full py-20 text-center text-gray-400">
                {modelSearchQuery ? `No cloud-local models matching "${modelSearchQuery}"` : "No cloud-local models installed yet."}
              </div>
            )}
            {cloudLocalModels.map(model => {
              const isRunning = runningModels.some(rm => rm.name === model.name || rm.model === model.name);
              return (
                <div key={model.digest} className={cn(
                  "bg-white p-5 rounded-3xl border transition-all group relative",
                  isRunning ? "border-green-200 shadow-md shadow-green-50" : "border-gray-200 shadow-sm hover:shadow-md"
                )}>
                  {isRunning && (
                    <div className="absolute top-4 right-12 flex items-center gap-1.5 bg-green-100 text-green-700 px-2 py-1 rounded-full text-[10px] font-bold animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      RUNNING
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      isRunning ? "bg-green-100 text-green-600" : "bg-purple-100 text-purple-600"
                    )}>
                      <Globe size={20} />
                    </div>
                    <button 
                      onClick={() => deleteModel(model.name)}
                      className="p-2 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3 className="font-bold text-gray-800 mb-1 truncate pr-16" title={model.name}>{model.name}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-medium uppercase">
                      Cloud-Local
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 pt-4 border-t border-gray-50">
                    <span>{formatSize(model.size)}</span>
                    <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedModel(model.name);
                      setCurrentView('chat');
                      if (!activeChatId) createNewChat();
                    }}
                    className="w-full mt-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-purple-200"
                  >
                    Select for Chat
                  </button>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {claudeModels.map(model => (
              <div key={model.name} className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all group relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100 text-purple-600">
                    <Globe size={20} />
                  </div>
                  <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2 py-1 rounded-full text-[10px] font-bold">
                    CLOUD
                  </div>
                </div>
                <h3 className="font-bold text-gray-800 mb-1 truncate">{model.name}</h3>
                <p className="text-xs text-gray-500 mb-4 line-clamp-2">{model.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-medium uppercase">
                    Anthropic API
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                    {model.name.includes('sonnet') ? 'High Intelligence' : model.name.includes('opus') ? 'Most Powerful' : 'Fast & Efficient'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-4 border-t border-gray-50">
                  <span>Pay-per-token</span>
                  <span>v3.5</span>
                </div>
                <button 
                  onClick={() => {
                    setSelectedModel(model.name);
                    setCurrentView('chat');
                    if (!activeChatId) createNewChat();
                  }}
                  className="w-full mt-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-purple-200"
                >
                  Select for Chat
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
