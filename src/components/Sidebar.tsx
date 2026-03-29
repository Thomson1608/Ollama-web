import React from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Cpu, 
  Terminal,
  RefreshCw,
  Settings,
  Download
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Chat, ConnectionStatus, ViewType } from '../types';

interface SidebarProps {
  isSidebarOpen: boolean;
  chats: Chat[];
  activeChatId: string | null;
  currentView: ViewType;
  connectionStatus: ConnectionStatus;
  setActiveChatId: (id: string | null) => void;
  setCurrentView: (view: ViewType) => void;
  createNewChat: () => void;
  deleteChat: (id: string, e: React.MouseEvent) => void;
  setShowSettings: (show: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isSidebarOpen,
  chats,
  activeChatId,
  currentView,
  connectionStatus,
  setActiveChatId,
  setCurrentView,
  createNewChat,
  deleteChat,
  setShowSettings
}) => {
  return (
    <motion.aside 
      initial={false}
      animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
      className="bg-white border-r border-gray-200 flex flex-col overflow-hidden"
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
        <div className="grid grid-cols-3 gap-2">
          <button 
            onClick={() => setCurrentView('chat')}
            className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
              currentView === 'chat' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
            )}
            title="Chat"
          >
            <MessageSquare size={16} />
          </button>
          <button 
            onClick={() => setCurrentView('models')}
            className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
              currentView === 'models' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
            )}
            title="Models"
          >
            <Cpu size={16} />
          </button>
          <button 
            onClick={() => setCurrentView('pull')}
            className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
              currentView === 'pull' ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"
            )}
            title="Pull"
          >
            <Download size={16} />
          </button>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg text-sm text-gray-600 transition-colors"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </motion.aside>
  );
};
