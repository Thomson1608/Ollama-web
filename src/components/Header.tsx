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
import { AIModel, ViewType, ConnectionStatus } from '../types';
import { cn } from '../lib/utils';

interface HeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  currentView: ViewType;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  models: AIModel[];
  connectionStatus: ConnectionStatus;
  checkConnection: () => void;
  workspaceHost: string;
  setWorkspaceHost: (host: string) => void;
  setShowSettings: (show: boolean) => void;
  isBusy: boolean;
  username?: string | null;
  onLogout?: () => void;
  mobileActiveTab?: 'chat' | 'workspace';
  setMobileActiveTab?: (tab: 'chat' | 'workspace') => void;
}

export const Header: React.FC<HeaderProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  currentView,
  selectedModel,
  setSelectedModel,
  models,
  connectionStatus,
  checkConnection,
  workspaceHost,
  setWorkspaceHost,
  setShowSettings,
  isBusy,
  username,
  onLogout,
  mobileActiveTab,
  setMobileActiveTab
}) => {
  const [now, setNow] = React.useState(new Date());
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 bg-bg-primary/80 backdrop-blur-md border-b border-border-primary flex items-center justify-between px-2 md:px-4 sticky top-0 z-10">
      <div className="flex items-center gap-1 md:gap-3 overflow-hidden">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-bg-tertiary rounded-lg text-text-secondary transition-colors shrink-0"
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
        <div className="h-4 w-[1px] bg-border-primary mx-0.5 md:mx-1 shrink-0" />
        {currentView === 'chat' ? (
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            {/* Mobile Tab Switcher */}
            <div className="flex md:hidden items-center bg-bg-secondary rounded-lg p-1 border border-border-primary">
              <button
                onClick={() => setMobileActiveTab?.('chat')}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                  mobileActiveTab === 'chat' ? "bg-accent-primary text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
              >
                CHAT
              </button>
              <button
                onClick={() => setMobileActiveTab?.('workspace')}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                  mobileActiveTab === 'workspace' ? "bg-accent-primary text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
              >
                WORK
              </button>
            </div>

            <div className="hidden md:flex flex-col shrink-0">
              <span className="text-[8px] md:text-[10px] font-medium text-text-secondary uppercase tracking-wider">Model</span>
              <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isBusy}
                className={`bg-transparent text-xs md:text-sm font-semibold text-text-primary focus:outline-none cursor-pointer max-w-[100px] md:max-w-none truncate ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {models.length === 0 ? (
                  <option value="">No models found</option>
                ) : (
                  <>
                  <optgroup label="AI Models" className="bg-bg-secondary text-text-primary">
                    {models.filter(m => 
                      !m.name.toLowerCase().includes('flux') && 
                      !m.name.toLowerCase().includes('stable-diffusion') &&
                      !m.name.toLowerCase().includes('sdxl')
                    ).map(m => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                  </>
                )}
              </select>
            </div>

            <div className="hidden md:flex flex-col shrink-0 border-l border-border-primary pl-2 md:pl-4">
              <span className="text-[8px] md:text-[10px] font-medium text-text-secondary uppercase tracking-wider">Host</span>
              <input
                type="text"
                value={workspaceHost}
                onChange={(e) => setWorkspaceHost(e.target.value)}
                className="bg-transparent text-xs md:text-sm font-semibold text-text-primary focus:outline-none max-w-[100px] md:max-w-[120px] truncate"
              />
            </div>
          </div>
        ) : currentView === 'project-list' ? (
          <span className="font-bold text-text-primary shrink-0 text-sm md:text-base">Projects</span>
        ) : (
          <span className="font-bold text-text-primary shrink-0 text-sm md:text-base">Settings</span>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {connectionStatus === 'disconnected' && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-full text-xs font-bold border border-red-500/20">
            <AlertCircle size={14} />
            OFFLINE
          </div>
        )}
        <button 
          onClick={checkConnection}
          className="p-2 hover:bg-bg-tertiary rounded-lg text-text-secondary transition-colors"
          title="Refresh Models"
        >
          <RefreshCw size={18} className={connectionStatus === 'checking' ? "animate-spin" : ""} />
        </button>

        {username && (
          <div className="relative ml-2">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 p-1.5 hover:bg-bg-tertiary rounded-lg transition-all border border-border-primary/50 hover:border-accent-primary/30"
            >
              <div className="w-8 h-8 bg-accent-primary/10 rounded-lg flex items-center justify-center shrink-0 border border-accent-primary/20">
                <User size={16} className="text-accent-primary" />
              </div>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-xs font-bold text-text-primary truncate max-w-[100px]">{username}</span>
                <span className="text-[10px] text-text-secondary capitalize">{username === 'admin' ? 'Administrator' : 'User'}</span>
              </div>
              <ChevronDown size={14} className={cn("text-text-secondary transition-transform", isUserMenuOpen && "rotate-180")} />
            </button>

            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-bg-secondary rounded-lg shadow-xl border border-border-primary py-2 z-30 animate-in fade-in zoom-in duration-200 origin-top-right">
                  <div className="px-4 py-2 border-b border-border-primary mb-1">
                    <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Account</p>
                    <p className="text-sm font-bold text-text-primary truncate">{username}</p>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setShowSettings(true);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary hover:text-accent-primary transition-colors"
                  >
                    <Settings size={16} />
                    <span>Common Settings</span>
                  </button>

                  <div className="h-[1px] bg-border-primary my-1" />
                  
                  <button 
                    onClick={() => {
                      onLogout?.();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
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
          <span className="truncate max-w-[200px] md:max-w-none">AI Proxy is unreachable. Check configuration.</span>
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
