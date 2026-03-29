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
  setShowSettings: (show: boolean) => void;
  isBusy: boolean;
  claudeUsage: { used: number; total: number };
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
  setShowSettings,
  isBusy,
  claudeUsage
}) => {
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const runningModel = runningModels.find(rm => rm.name === selectedModel || rm.model === selectedModel);
  const isClaude = selectedModel.startsWith('claude-');

  const formatExpiresAt = (expiresAt: string) => {
    if (!expiresAt) return '';
    try {
      const date = new Date(expiresAt);
      const diffMs = date.getTime() - now.getTime();
      if (diffMs <= 0) return 'Expiring...';
      
      const diffMins = Math.floor(diffMs / 60000);
      const diffSecs = Math.floor((diffMs % 60000) / 1000);
      
      if (diffMins > 0) {
        return `${diffMins}m ${diffSecs}s`;
      }
      return `${diffSecs}s`;
    } catch (e) {
      return expiresAt;
    }
  };

  const claudeModels = [
    'claude-3-5-sonnet-20240620',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307'
  ];

  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3 overflow-hidden">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors shrink-0"
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
        <div className="h-4 w-[1px] bg-gray-200 mx-1 shrink-0" />
        {currentView === 'chat' ? (
          <div className="flex items-center gap-4 overflow-hidden">
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Model</span>
              <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isBusy}
                className={`bg-transparent text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer max-w-[120px] md:max-w-none truncate ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {models.length === 0 && claudeModels.length === 0 ? (
                  <option value="">No models found</option>
                ) : (
                  <>
                    <optgroup label="Claude Models (API)">
                      {claudeModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Local Models (Ollama)">
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

            {runningModel && !isClaude && (
              <div className="flex flex-col border-l border-gray-100 pl-4 shrink-0">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Until Expiry</span>
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  {formatExpiresAt(runningModel.expires_at)}
                </span>
              </div>
            )}

            {isClaude && (
              <div className="flex flex-col border-l border-gray-100 pl-4 shrink-0 hidden sm:flex">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Claude Usage</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                    {Math.round((claudeUsage.used / claudeUsage.total) * 100)}%
                  </span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 transition-all duration-500" 
                      style={{ width: `${(claudeUsage.used / claudeUsage.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : currentView === 'models' ? (
          <span className="font-bold text-gray-800 shrink-0">Installed Models</span>
        ) : (
          <span className="font-bold text-gray-800 shrink-0">Pull New Models</span>
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
          <span className="truncate max-w-[200px] md:max-w-none">Ollama is unreachable. Check server status.</span>
          <button 
            onClick={() => setShowSettings(true)}
            className="underline font-bold hover:text-red-100 transition-colors ml-2 shrink-0"
          >
            Settings
          </button>
        </div>
      )}
    </header>
  );
};
