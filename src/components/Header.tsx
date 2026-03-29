import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { OllamaModel, RunningModel, ViewType, ConnectionStatus } from '../types';

interface HeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  currentView: ViewType;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  models: OllamaModel[];
  runningModels: RunningModel[];
  connectionStatus: ConnectionStatus;
  checkConnection: () => void;
  ollamaUrl: string;
  setShowSettings: (show: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  currentView,
  selectedModel,
  setSelectedModel,
  models,
  runningModels,
  connectionStatus,
  checkConnection,
  ollamaUrl,
  setShowSettings
}) => {
  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
        <div className="h-4 w-[1px] bg-gray-200 mx-1" />
        {currentView === 'chat' ? (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Model</span>
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer"
            >
              {models.length === 0 ? (
                <option value="">No models found</option>
              ) : (
                <>
                  <optgroup label="Installed Models">
                    {models.map(m => {
                      const isRunning = runningModels.some(rm => rm.name === m.name || rm.model === m.name);
                      return (
                        <option key={m.name} value={m.name}>
                          {m.name} {isRunning ? ' (Running)' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                </>
              )}
            </select>
          </div>
        ) : currentView === 'models' ? (
          <span className="font-bold text-gray-800">Installed Models</span>
        ) : (
          <span className="font-bold text-gray-800">Pull New Models</span>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {connectionStatus === 'disconnected' && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-full text-xs font-bold border border-red-100">
            <AlertCircle size={14} />
            OFFLINE
          </div>
        )}
        <button 
          onClick={checkConnection}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          title="Refresh Models"
        >
          <RefreshCw size={18} className={connectionStatus === 'checking' ? "animate-spin" : ""} />
        </button>
      </div>

      {connectionStatus === 'disconnected' && (
        <div className="absolute top-full left-0 right-0 bg-red-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 z-20">
          <AlertCircle size={14} />
          <span>Ollama is unreachable at {ollamaUrl}. Please check your settings and CORS configuration.</span>
          <button 
            onClick={() => setShowSettings(true)}
            className="underline font-bold hover:text-red-100 transition-colors ml-2"
          >
            Open Settings
          </button>
        </div>
      )}
    </header>
  );
};
