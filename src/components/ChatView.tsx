import React from 'react';
import { 
  Send, 
  Plus, 
  Cpu, 
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Chat, ConnectionStatus } from '../types';

interface ChatViewProps {
  activeChatId: string | null;
  activeChat: Chat | undefined;
  isLoading: boolean;
  isAiTypingGlobally?: boolean;
  input: string;
  setInput: (input: string) => void;
  handleSendMessage: (e?: React.FormEvent) => void;
  createNewChat: () => void;
  connectionStatus: ConnectionStatus;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export const ChatView: React.FC<ChatViewProps> = ({
  activeChatId,
  activeChat,
  isLoading,
  isAiTypingGlobally,
  input,
  setInput,
  handleSendMessage,
  createNewChat,
  connectionStatus,
  messagesEndRef
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {!activeChatId ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
              <Cpu size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-800">Ollama Local AI</h2>
              <p className="text-gray-500">
                Select a model and start a conversation. Your data stays on your machine.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 w-full">
              <button 
                onClick={createNewChat}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-200"
              >
                <Plus size={18} />
                New Conversation
              </button>
            </div>
            {connectionStatus === 'disconnected' && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-left">
                <AlertCircle className="text-red-500 shrink-0" size={20} />
                <div className="text-sm">
                  <p className="font-semibold text-red-800">Ollama is unreachable</p>
                  <p className="text-red-600 mt-1">
                    Make sure Ollama is running and CORS is enabled with:<br/>
                    <code className="bg-red-100 px-1 rounded">OLLAMA_ORIGINS="*" ollama serve</code>
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {activeChat?.messages.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} 
                className={cn(
                  "flex gap-4",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  msg.role === 'user' ? "bg-gray-800 text-white" : "bg-blue-100 text-blue-600"
                )}>
                  {msg.role === 'user' ? 'U' : <Cpu size={16} />}
                </div>
                <div className={cn(
                  "max-w-[85%] p-4 rounded-2xl",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-white border border-gray-200 rounded-tl-none shadow-sm"
                )}>
                  <div className={cn("markdown-body", msg.role === 'user' ? "text-white" : "text-gray-800")}>
                    <Markdown
                      components={{
                        code({ node, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          const codeString = String(children).replace(/\n$/, '');
                          const isBlock = !!match;
                          
                          if (isBlock) {
                            // Try to extract filename from language-filename pattern
                            // e.g. language-javascript:App.tsx
                            const langPart = match ? match[1] : '';
                            const fullClassName = className || '';
                            const filenameMatch = fullClassName.match(/language-[\w.]+:(.+)/);
                            const filename = filenameMatch ? filenameMatch[1] : null;

                            return (
                              <div className="relative group/code my-4">
                                <div className="absolute right-2 top-2 flex gap-2 opacity-0 group-hover/code:opacity-100 transition-opacity z-10">
                                  {filename && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await fetch('/api/workspace/write', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ name: filename, content: codeString })
                                          });
                                          if (res.ok) {
                                            toast.success(`Applied to ${filename}`);
                                          }
                                        } catch (err) {
                                          toast.error('Failed to apply to workspace');
                                        }
                                      }}
                                      className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-2 py-1 rounded shadow-sm flex items-center gap-1"
                                    >
                                      <Plus size={10} />
                                      Apply to Workspace
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(codeString);
                                      toast.success('Copied to clipboard');
                                    }}
                                    className="bg-gray-800 hover:bg-black text-white text-[10px] px-2 py-1 rounded shadow-sm"
                                  >
                                    Copy
                                  </button>
                                </div>
                                <pre className={cn("rounded-xl p-4 overflow-x-auto bg-gray-900 text-gray-100 text-sm", className)}>
                                  <code {...props}>{children}</code>
                                </pre>
                                {filename && (
                                  <div className="absolute left-4 -top-3 bg-gray-800 text-gray-300 text-[10px] px-2 py-0.5 rounded border border-gray-700 font-mono">
                                    {filename}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return <code className={className} {...props}>{children}</code>;
                        }
                      }}
                    >
                      {msg.content}
                    </Markdown>
                  </div>
                </div>
              </motion.div>
            ))}
            {(isLoading || isAiTypingGlobally) && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 animate-pulse">
                  <Cpu size={16} />
                </div>
                <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-none shadow-sm">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    {isAiTypingGlobally && !isLoading && (
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                        AI is responding in another tab...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 md:p-6 bg-gradient-to-t from-[#f5f5f5] via-[#f5f5f5] to-transparent">
        <form 
          onSubmit={handleSendMessage}
          className="max-w-3xl mx-auto relative group"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              isAiTypingGlobally 
                ? "AI is busy in another tab..." 
                : activeChatId 
                  ? "Ask anything..." 
                  : "Start a new chat first"
            }
            disabled={!activeChatId || isLoading || isAiTypingGlobally}
            rows={1}
            className="w-full bg-white border border-gray-200 rounded-2xl p-4 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || isAiTypingGlobally || !activeChatId}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-xl transition-all shadow-lg shadow-blue-200 disabled:shadow-none"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
