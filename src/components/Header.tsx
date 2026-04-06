import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
  AlertCircle,
  User,
  LogOut,
  Settings,
  ChevronDown
} from 'lucide-react';
import { OllamaModel, RunningModel, ViewType, ConnectionStatus } from '../types';
import { cn } from '../lib/utils';

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
  username?: string | null;
  onLogout?: () => void;
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
  username,
  onLogout
}) => {
  const [now, setNow] = React.useState(new Date());
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const runningModel = runningModels.find(rm => rm.name === selectedModel || rm.model === selectedModel);

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

  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-2 md:px-4 sticky top-0 z-10">
      <div className="flex items-center gap-1 md:gap-3 overflow-hidden">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors shrink-0"
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
        <div className="h-4 w-[1px] bg-gray-200 mx-0.5 md:mx-1 shrink-0" />
        {currentView === 'chat' ? (
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <div className="flex flex-col shrink-0">
              <span className="text-[8px] md:text-[10px] font-medium text-gray-400 uppercase tracking-wider">Model</span>
              <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isBusy}
                className={`bg-transparent text-xs md:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer max-w-[100px] md:max-w-none truncate ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {models.length === 0 ? (
                  <option value="">No models found</option>
                ) : (
                  <>
                    <optgroup label="Local Models (Ollama)">
                      {models.filter(m => 
                        !m.name.toLowerCase().includes('flux') && 
                        !m.name.toLowerCase().includes('stable-diffusion') &&
                        !m.name.toLowerCase().includes('sdxl')
                      ).map(m => {
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

            {runningModel && (
              <div className="flex flex-col border-l border-gray-100 pl-2 md:pl-4 shrink-0">
                <span className="text-[8px] md:text-[10px] font-medium text-gray-400 uppercase tracking-wider">Expiry</span>
                <span className="text-[10px] md:text-xs font-mono font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                  {formatExpiresAt(runningModel.expires_at)}
                </span>
              </div>
            )}
          </div>
        ) : currentView === 'models' ? (
          <span className="font-bold text-gray-800 shrink-0 text-sm md:text-base">Models</span>
        ) : currentView === 'pull' ? (
          <span className="font-bold text-gray-800 shrink-0 text-sm md:text-base">Pull</span>
        ) : currentView === 'workspace' ? (
          <span className="font-bold text-gray-800 shrink-0 text-sm md:text-base">Workspace</span>
        ) : currentView === 'project-list' ? (
          <span className="font-bold text-gray-800 shrink-0 text-sm md:text-base">Projects</span>
        ) : (
          <span className="font-bold text-gray-800 shrink-0 text-sm md:text-base">Settings</span>
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

        {username && (
          <div className="relative ml-2">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-xl transition-all border border-transparent hover:border-gray-200"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <User size={16} className="text-blue-600" />
              </div>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-xs font-bold text-gray-700 truncate max-w-[100px]">{username}</span>
                <span className="text-[10px] text-gray-400 capitalize">{username === 'admin' ? 'Administrator' : 'User'}</span>
              </div>
              <ChevronDown size={14} className={cn("text-gray-400 transition-transform", isUserMenuOpen && "rotate-180")} />
            </button>

            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-30 animate-in fade-in zoom-in duration-200 origin-top-right">
                  <div className="px-4 py-2 border-b border-gray-50 mb-1">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Account</p>
                    <p className="text-sm font-bold text-gray-800 truncate">{username}</p>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setShowSettings(true);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                  >
                    <Settings size={16} />
                    <span>Common Settings</span>
                  </button>

                  <div className="h-[1px] bg-gray-50 my-1" />
                  
                  <button 
                    onClick={() => {
                      onLogout?.();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={16} />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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
