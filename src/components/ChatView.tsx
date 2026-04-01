import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Plus, 
  Cpu, 
  AlertCircle,
  Globe,
  FileEdit,
  FileText,
  Trash2,
  FolderSearch,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX
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
  isGloballyBusy?: boolean;
  input: string;
  setInput: (input: string) => void;
  handleSendMessage: (e?: React.FormEvent) => void;
  createNewChat: () => void;
  connectionStatus: ConnectionStatus;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const ToolCallRenderer = ({ toolCall }: { toolCall: any }) => {
  try {
    const tool = toolCall.tool;
    const args = toolCall.args;
    
    let icon = <Loader2 className="animate-spin text-gray-500" size={16} />;
    let text = 'Working...';
    
    switch (tool) {
      case 'write_file':
        icon = <FileEdit size={16} className="text-blue-500" />;
        text = `Writing to ${args.name}`;
        break;
      case 'read_file':
        icon = <FileText size={16} className="text-green-500" />;
        text = `Reading ${args.name}`;
        break;
      case 'delete_file':
        icon = <Trash2 size={16} className="text-red-500" />;
        text = `Deleting ${args.name}`;
        break;
      case 'list_files':
        icon = <FolderSearch size={16} className="text-purple-500" />;
        text = `Listing workspace files`;
        break;
      default:
        text = `Using tool: ${tool}`;
    }

    return (
      <div className="my-3 inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm">
        {icon}
        <span>{text}</span>
      </div>
    );
  } catch (e) {
    return null; // Hide invalid tool calls
  }
};

export const ChatView: React.FC<ChatViewProps> = ({
  activeChatId,
  activeChat,
  isLoading,
  isAiTypingGlobally,
  isGloballyBusy,
  input,
  setInput,
  handleSendMessage,
  createNewChat,
  connectionStatus,
  messagesEndRef
}) => {
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef(input);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'vi-VN'; 

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript) {
            setInput(inputRef.current + (inputRef.current && !inputRef.current.endsWith(' ') ? ' ' : '') + finalTranscript);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListening(false);
          if (event.error !== 'no-speech') {
            toast.error('Lỗi nhận diện giọng nói: ' + event.error);
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, [setInput]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (!recognitionRef.current) {
        toast.error('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói.');
        return;
      }
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast.success('Đang nghe...');
      } catch (e) {
        console.error(e);
      }
    }
  };

  const toggleSpeech = (text: string, index: number) => {
    if (speakingMessageIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingMessageIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    
    // Clean up markdown and tool calls before speaking
    const cleanText = text
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/```[\s\S]*?```/g, 'Đoạn mã code.')
      .replace(/[*_~`#]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    
    utterance.onend = () => setSpeakingMessageIndex(null);
    utterance.onerror = () => setSpeakingMessageIndex(null);
    
    setSpeakingMessageIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const renderMessage = (content: string) => {
    // Split by complete tool calls
    const parts = content.split(/(<tool_call>[\s\S]*?<\/tool_call>)/g);
    
    return parts.map((part, i) => {
      if (part.startsWith('<tool_call>') && part.endsWith('</tool_call>')) {
        try {
          const match = part.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
          if (!match) return null;
          let jsonString = match[1].trim();
          if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
          }
          const toolCall = JSON.parse(jsonString);
          return <ToolCallRenderer key={i} toolCall={toolCall} />;
        } catch (e) {
          return null;
        }
      }
      
      // Handle incomplete tool calls during streaming
      if (part.includes('<tool_call>')) {
         const visibleText = part.split('<tool_call>')[0];
         return (
           <React.Fragment key={i}>
             <Markdown
               components={{
                 code({ node, className, children, ...props }: any) {
                   return <code className={className} {...props}>{children}</code>;
                 }
               }}
             >
               {visibleText}
             </Markdown>
             <div className="my-3 inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm animate-pulse">
               <Loader2 className="animate-spin text-blue-500" size={16} />
               <span>Working on files...</span>
             </div>
           </React.Fragment>
         );
      }

      return (
        <Markdown
          key={i}
          components={{
            code({ node, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(children).replace(/\n$/, '');
              const isBlock = !!match || String(children).includes('\n');
              
              if (isBlock) {
                // Check if it's a tool call JSON block
                try {
                  const parsed = JSON.parse(codeString);
                  let calls = parsed;
                  if (!Array.isArray(calls)) {
                    calls = [calls];
                  }
                  
                  const validCalls = calls.filter((call: any) => call && call.tool && call.args && ['list_files', 'read_file', 'write_file', 'delete_file'].includes(call.tool));
                  
                  if (validCalls.length > 0) {
                    return (
                      <div className="flex flex-col gap-2">
                        {validCalls.map((call: any, idx: number) => (
                          <ToolCallRenderer key={idx} toolCall={call} />
                        ))}
                      </div>
                    );
                  }
                } catch (e) {}

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
          {part}
        </Markdown>
      );
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {!activeChatId ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
              <Cpu size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-800">AI Chat Interface</h2>
              <p className="text-gray-500">
                Select a model from the Models tab to start.
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
                  msg.role === 'user' 
                    ? "bg-gray-800 text-white" 
                    : "bg-blue-100 text-blue-600"
                )}>
                  {msg.role === 'user' ? 'U' : <Cpu size={16} />}
                </div>
                <div className={cn(
                  "max-w-[85%] p-4 rounded-2xl relative group/msg",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-white border border-gray-200 rounded-tl-none shadow-sm"
                )}>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => toggleSpeech(msg.content, i)}
                      className="absolute -right-10 top-2 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover/msg:opacity-100"
                      title={speakingMessageIndex === i ? "Dừng đọc" : "Đọc tin nhắn"}
                    >
                      {speakingMessageIndex === i ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                  )}
                  <div className={cn("markdown-body", msg.role === 'user' ? "text-white" : "text-gray-800")}>
                    {renderMessage(msg.content)}
                  </div>
                </div>
              </motion.div>
            ))}
            {(isLoading || isAiTypingGlobally) && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 animate-pulse bg-blue-100 text-blue-600">
                  <Cpu size={16} />
                </div>
                <div className="bg-white border p-4 rounded-2xl rounded-tl-none shadow-sm border-gray-200">
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
                : isGloballyBusy
                  ? "AI is busy in another chat..."
                  : activeChatId 
                    ? "Ask anything..." 
                    : "Start a new chat first"
            }
            disabled={!activeChatId || isLoading || isAiTypingGlobally || isGloballyBusy}
            rows={1}
            className="w-full bg-white border border-gray-200 rounded-2xl p-4 pr-24 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleListening}
              disabled={!activeChatId || isLoading || isAiTypingGlobally || isGloballyBusy}
              className={cn(
                "p-2 rounded-xl transition-all shadow-sm disabled:shadow-none disabled:bg-transparent disabled:text-gray-400",
                isListening 
                  ? "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
              title={isListening ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isAiTypingGlobally || isGloballyBusy || !activeChatId}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-xl transition-all shadow-lg shadow-blue-200 disabled:shadow-none"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
