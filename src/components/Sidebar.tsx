import React from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Cpu, 
  Terminal,
  RefreshCw,
  Settings,
  Download,
  FileDown,
  FileUp,
  Folder
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Chat, ConnectionStatus, ViewType } from '../types';

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isMobile: boolean;
  chats: Chat[];
  activeChatId: string | null;
  currentView: ViewType;
  connectionStatus: ConnectionStatus;
  setActiveChatId: (id: string | null) => void;
  setCurrentView: (view: ViewType) => void;
  createNewChat: () => void;
  deleteChat: (id: string, e: React.MouseEvent) => void;
  clearAllChats: () => void;
  exportData: () => void;
  importData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isSyncing?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  isMobile,
  chats,
  activeChatId,
  currentView,
  connectionStatus,
  setActiveChatId,
  setCurrentView,
  createNewChat,
  deleteChat,
  clearAllChats,
  exportData,
  importData,
  isSyncing
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : 0, 
          opacity: isSidebarOpen ? 1 : 0,
          x: isSidebarOpen ? 0 : -280
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          "bg-white border-r border-gray-200 flex flex-col overflow-hidden h-full shrink-0",
          isMobile && "fixed inset-y-0 left-0 z-50 shadow-2xl"
        )}
      >
      <div className="p-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <Terminal size={20} className="text-blue-600" />
          <span>Ollama UI</span>
        </div>
        <button 
          onClick={createNewChat}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
          title="New Chat"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chats.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No chats yet
          </div>
        ) : (
          chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => {
                setActiveChatId(chat.id);
                setCurrentView('chat');
                if (isMobile) setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm transition-all group",
                activeChatId === chat.id && currentView === 'chat'
                  ? "bg-blue-50 text-blue-700 font-medium" 
                  : "hover:bg-gray-50 text-gray-600"
              )}
            >
              <MessageSquare size={16} className={activeChatId === chat.id && currentView === 'chat' ? "text-blue-500" : "text-gray-400"} />
              <span className="flex-1 truncate">{chat.title}</span>
              <button 
                onClick={(e) => deleteChat(chat.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all text-gray-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </button>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-100 space-y-3">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-gray-500">Status</span>
          <div className="flex items-center gap-1.5">
            {isSyncing && (
              <RefreshCw size={10} className="animate-spin text-blue-500 mr-1" />
            )}
            {connectionStatus === 'connected' ? (
              <>
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-green-600 font-medium">Online</span>
              </>
            ) : connectionStatus === 'disconnected' ? (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-600 font-medium">Offline</span>
              </>
            ) : (
              <>
                <RefreshCw size={12} className="animate-spin text-gray-400" />
                <span className="text-gray-400">Checking...</span>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button 
            onClick={() => {
              setCurrentView('chat');
              if (isMobile) setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
              currentView === 'chat' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
            )}
            title="Chat"
          >
            <MessageSquare size={16} />
          </button>
          <button 
            onClick={() => {
              setCurrentView('models');
              if (isMobile) setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
              currentView === 'models' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
            )}
            title="Models"
          >
            <Cpu size={16} />
          </button>
          <button 
            onClick={() => {
              setCurrentView('pull');
              if (isMobile) setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
              currentView === 'pull' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
            )}
            title="Pull"
          >
            <Download size={16} />
          </button>
          <button 
            onClick={() => {
              setCurrentView('workspace');
              if (isMobile) setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
              currentView === 'workspace' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
            )}
            title="Workspace"
          >
            <Folder size={16} />
          </button>
        </div>
        <button 
          onClick={() => {
            setCurrentView('settings');
            if (isMobile) setIsSidebarOpen(false);
          }}
          className={cn(
            "w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors",
            currentView === 'settings' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
          )}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={exportData}
            className="flex items-center justify-center gap-2 p-2 hover:bg-gray-100 rounded-lg text-xs text-gray-500 transition-colors border border-gray-100"
            title="Export JSON"
          >
            <FileDown size={14} />
            <span>Export</span>
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-2 hover:bg-gray-100 rounded-lg text-xs text-gray-500 transition-colors border border-gray-100"
            title="Import JSON"
          >
            <FileUp size={14} />
            <span>Import</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={importData} 
            accept=".json" 
            className="hidden" 
          />
        </div>
        <button 
          onClick={clearAllChats}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors border border-red-100"
        >
          <Trash2 size={14} />
          Clear All Chats
        </button>
      </div>
    </motion.aside>
    </>
  );
};
