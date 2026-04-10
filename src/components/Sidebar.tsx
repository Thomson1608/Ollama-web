import React from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Terminal,
  RefreshCw,
  Settings,
  Folder,
  BarChart,
  LogOut,
  User,
  Edit2
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
  isSyncing?: boolean;
  username?: string | null;
  onLogout?: () => void;
  onCloseChat?: (id: string) => void;
  projectType?: 'research' | 'coding';
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
  isSyncing,
  username,
  onLogout,
  onCloseChat,
  projectType = 'coding'
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

  const showChatList = projectType === 'research';

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
          "bg-bg-secondary border-r border-border-primary flex flex-col overflow-hidden h-full shrink-0",
          isMobile && "fixed inset-y-0 left-0 z-50 shadow-2xl"
        )}
      >
      <div className="p-4 flex items-center justify-between border-b border-border-primary">
        <div className="flex items-center gap-2 font-semibold text-text-primary">
          <Terminal size={20} className="text-accent-primary" />
          <span>AI Studio</span>
        </div>
        <div className="flex items-center gap-1">
          {showChatList && (
            <button 
              onClick={createNewChat}
              className="p-1.5 hover:bg-bg-tertiary rounded-lg transition-colors text-text-secondary hover:text-text-primary"
              title="New Chat"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
        {!showChatList ? (
          <div className="px-3 py-6 text-center space-y-4">
            <div className="w-12 h-12 bg-accent-primary/10 rounded-2xl flex items-center justify-center mx-auto border border-accent-primary/20">
              <Terminal size={24} className="text-accent-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">Coding Mode</p>
              <p className="text-[10px] text-text-secondary mt-1">Single chat process active with full workspace access.</p>
            </div>
          </div>
        ) : chats.length === 0 ? (
          <div className="text-center py-10 text-text-secondary text-sm">
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
                "w-full flex items-center gap-3 p-3 rounded-lg text-left text-sm transition-all group cursor-pointer border border-transparent",
                activeChatId === chat.id && currentView === 'chat'
                  ? "bg-accent-primary/10 text-accent-primary font-medium border-accent-primary/20" 
                  : "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary hover:border-border-primary/50"
              )}
            >
              <MessageSquare size={16} className={activeChatId === chat.id && currentView === 'chat' ? "text-accent-primary" : "text-text-secondary"} />
              {editingChatId === chat.id ? (
                <input
                  autoFocus
                  className="flex-1 bg-bg-primary border border-accent-primary rounded px-1 py-0.5 outline-none text-sm text-text-primary"
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
                  <div className="flex-1 flex flex-col min-w-0">
                    <span className="truncate">{chat.title}</span>
                    {chat.isClosed && (
                      <span className="text-[10px] text-text-secondary font-medium">Closed (Read-only)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {!chat.isClosed && onCloseChat && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseChat(chat.id);
                        }}
                        className="p-1 hover:bg-bg-primary rounded transition-all text-text-secondary hover:text-orange-400"
                        title="Close Chat"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => handleStartRename(chat, e)}
                      className="p-1 hover:bg-bg-primary rounded transition-all text-text-secondary hover:text-accent-primary"
                      title="Rename"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="p-1 hover:bg-bg-primary rounded transition-all text-text-secondary hover:text-red-400"
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

      <div className="p-4 border-t border-border-primary">
        <button 
          onClick={() => {
            setCurrentView('chat');
            if (isMobile) setIsSidebarOpen(false);
          }}
          className={cn(
            "w-full flex items-center justify-center gap-2 p-2 rounded-lg text-sm transition-colors",
            currentView === 'chat' ? "bg-accent-primary/10 text-accent-primary font-medium" : "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary"
          )}
          title="Chat"
        >
          <MessageSquare size={16} />
          <span>Chat</span>
        </button>
      </div>
    </motion.aside>
    </>
  );
};
