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
  Folder,
  BarChart,
  LogOut,
  User,
  Edit2,
  LayoutGrid
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
  onRenameChat: (id: string, newTitle: string) => void;
  clearAllChats: () => void;
  isSyncing?: boolean;
  username?: string | null;
  onLogout?: () => void;
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
  onRenameChat,
  clearAllChats,
  isSyncing,
  username,
  onLogout
}) => {
  const [editingChatId, setEditingChatId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');

  const handleStartRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const handleFinishRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameChat(id, editTitle.trim());
    }
    setEditingChatId(null);
  };

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
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setCurrentView('project-list')}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            title="Projects"
          >
            <LayoutGrid size={18} />
          </button>
          <button 
            onClick={createNewChat}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            title="New Chat"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chats.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No chats yet
          </div>
        ) : (
          chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => {
                setActiveChatId(chat.id);
                setCurrentView('chat');
                if (isMobile) setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm transition-all group cursor-pointer",
                activeChatId === chat.id && currentView === 'chat'
                  ? "bg-blue-50 text-blue-700 font-medium" 
                  : "hover:bg-gray-50 text-gray-600"
              )}
            >
              <MessageSquare size={16} className={activeChatId === chat.id && currentView === 'chat' ? "text-blue-500" : "text-gray-400"} />
              {editingChatId === chat.id ? (
                <input
                  autoFocus
                  className="flex-1 bg-white border border-blue-300 rounded px-1 py-0.5 outline-none text-sm"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleFinishRename(chat.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFinishRename(chat.id);
                    if (e.key === 'Escape') setEditingChatId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="flex-1 truncate">{chat.title}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={(e) => handleStartRename(chat, e)}
                      className="p-1 hover:bg-gray-200 rounded transition-all text-gray-400 hover:text-blue-500"
                      title="Rename"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="p-1 hover:bg-gray-200 rounded transition-all text-gray-400 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-100 space-y-3">
        {username && (
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                <User size={16} className="text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-700 truncate">{username}</span>
            </div>
            <button 
              onClick={onLogout}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-500 hover:text-red-600"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
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
        <div className={cn("grid gap-2", username === 'admin' ? "grid-cols-4" : "grid-cols-1")}>
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
          
          {username === 'admin' && (
            <>
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
            </>
          )}
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
