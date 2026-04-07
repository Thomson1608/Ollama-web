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
  VolumeX,
  Settings2,
  ChevronDown,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  MousePointer2
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
  handleSendMessage: (e?: React.FormEvent, isRetry?: boolean, image?: string | null) => void;
  createNewChat: () => void;
  connectionStatus: ConnectionStatus;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onUpdateSystemPrompt: (prompt: string) => void;
  username?: string | null;
  projectId?: string | null;
}

const ThoughtBlock = ({ children }: { children: React.ReactNode }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <div className="my-4 border border-blue-100 bg-blue-50/30 rounded-xl overflow-hidden transition-all shadow-sm">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:bg-blue-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Cpu size={14} className={cn(isExpanded && "animate-pulse")} />
          <span>Thinking Process</span>
        </div>
        <ChevronDown size={14} className={cn("transition-transform duration-300", isExpanded && "rotate-180")} />
      </button>
      <motion.div 
        initial={false}
        animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
        className="overflow-hidden"
      >
        <div className="px-4 pb-4 text-xs text-blue-800/70 italic leading-relaxed border-t border-blue-100/50 pt-2">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

const ToolCallRenderer = ({ toolCall, isFinished }: { toolCall: any, isFinished: boolean }) => {
  const [status, setStatus] = useState<'idle' | 'working' | 'completed' | 'error'>('idle');

  useEffect(() => {
    if (isFinished && status === 'idle') {
      setStatus('completed');
    }
  }, [isFinished, status]);

  try {
    const tool = toolCall.tool;
    const args = toolCall.args;
    
    let icon = <FileEdit size={16} className="text-text-secondary" />;
    let title = 'Action';
    let detail = '';
    
    switch (tool) {
      case 'write_file':
        title = 'Edited file';
        detail = args.name;
        break;
      case 'read_file':
        title = 'Read file';
        detail = args.name;
        break;
      case 'delete_file':
        title = 'Deleted file';
        detail = args.name;
        break;
      case 'list_files':
        title = 'Listed workspace files';
        break;
      case 'run_command':
        title = 'Executed command';
        detail = args.command;
        break;
      default:
        title = `Using tool: ${tool}`;
    }

    return (
      <div className="my-4 bg-bg-secondary border border-border-primary rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary bg-bg-tertiary/30">
          <FileText size={16} className="text-text-secondary" />
          <span className="text-sm font-bold text-text-primary">Action history</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {status === 'working' ? <Loader2 className="animate-spin text-accent-primary" size={16} /> : icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary font-medium">{title}</p>
              {detail && (
                <div className="mt-2 flex items-center justify-between group/item">
                  <span className="text-xs text-text-secondary font-mono truncate mr-4">{detail}</span>
                  {status === 'completed' && <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } catch (e) {
    return null;
  }
};

const FileCodeBlock = ({ filename, code, username, isFinished }: { filename: string, code: string, username: string | null | undefined, isFinished: boolean }) => {
  const [status, setStatus] = useState<'idle' | 'writing' | 'saved' | 'error'>('idle');
  const writtenRef = useRef(false);
  const lastCodeRef = useRef(code);

  useEffect(() => {
    // File writing from code blocks is now handled by the backend heuristic.
    // The frontend only displays the status.
    if (isFinished && status === 'idle') {
      setStatus('saved');
    }
  }, [isFinished, status]);

  return (
    <div className="my-4 p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between group shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          status === 'saved' ? "bg-green-50 text-green-600" : 
          status === 'error' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
        )}>
          {status === 'writing' ? <Loader2 size={20} className="animate-spin" /> : <FileEdit size={20} />}
        </div>
        <div className="flex flex-col overflow-hidden text-left">
          <span className="text-sm font-bold text-gray-800 truncate">{filename}</span>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            status === 'saved' ? "text-green-500" : 
            status === 'error' ? "text-red-500" : "text-gray-400"
          )}>
            {status === 'writing' ? 'Đang lưu vào workspace...' : 
             status === 'saved' ? 'Đã lưu vào workspace' : 
             status === 'error' ? 'Lỗi khi lưu file' : 'Chờ hoàn tất...'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === 'saved' && <CheckCircle2 size={18} className="text-green-500 animate-in zoom-in duration-300" />}
        <button 
          onClick={() => {
            navigator.clipboard.writeText(code);
            toast.success('Đã sao chép mã code');
          }}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
          title="Copy code"
        >
          <Copy size={16} />
        </button>
      </div>
    </div>
  );
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
  messagesEndRef,
  onUpdateSystemPrompt,
  username,
  projectId
}) => {
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [isSystemPromptExpanded, setIsSystemPromptExpanded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image is too large. Max 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSendMessage = (e?: React.FormEvent) => {
    handleSendMessage(e, false, selectedImage);
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
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

  const renderMessage = (content: string, isStreaming: boolean) => {
    // Split by thought and tool calls
    const parts = content.split(/(<thought>[\s\S]*?<\/thought>|<tool_call>[\s\S]*?<\/tool_call>)/g);
    
    return parts.map((part, i) => {
      if (part.startsWith('<thought>') && part.endsWith('</thought>')) {
        const thought = part.match(/<thought>([\s\S]*?)<\/thought>/)?.[1] || '';
        return <ThoughtBlock key={i}>{thought}</ThoughtBlock>;
      }

      if (part.startsWith('<tool_call>') && part.endsWith('</tool_call>')) {
        try {
          const match = part.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
          if (!match) return null;
          let jsonString = match[1].trim();
          if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
          }
          const toolCall = JSON.parse(jsonString);
          return <ToolCallRenderer key={i} toolCall={toolCall} isFinished={!isStreaming} />;
        } catch (e) {
          return null;
        }
      }
      
      // Handle incomplete tags during streaming
      if (part.includes('<thought>') && !part.includes('</thought>')) {
        const thought = part.split('<thought>')[1];
        return <ThoughtBlock key={i}>{thought}</ThoughtBlock>;
      }

      if (part.includes('<tool_call>') && !part.includes('</tool_call>')) {
         const visibleText = part.split('<tool_call>')[0];
         return (
           <React.Fragment key={i}>
             {visibleText && (
               <Markdown
                 components={{
                   code({ node, className, children, ...props }: any) {
                     return <code className={className} {...props}>{children}</code>;
                   }
                 }}
               >
                 {visibleText}
               </Markdown>
             )}
             <div className="my-3 inline-flex items-center gap-2 px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm font-medium text-text-primary shadow-sm animate-pulse">
               <Loader2 className="animate-spin text-accent-primary" size={16} />
               <span>Updating workspace...</span>
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
                  
                  const validCalls = calls.filter((call: any) => call && call.tool && call.args && ['list_files', 'read_file', 'write_file', 'delete_file', 'run_command'].includes(call.tool));
                  
                  if (validCalls.length > 0) {
                    return (
                      <div className="flex flex-col gap-2">
                        {validCalls.map((call: any, idx: number) => (
                          <ToolCallRenderer key={idx} toolCall={call} isFinished={!isStreaming} />
                        ))}
                      </div>
                    );
                  }
                } catch (e) {}

                const langPart = match ? match[1] : '';

                return (
                  <div className="relative group/code my-8">
                    <div className="flex items-center justify-between bg-[#1e1e1e] text-gray-300 px-4 py-2 rounded-t-xl border-x border-t border-border-primary">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="ml-2 text-[10px] font-mono truncate max-w-[150px] md:max-w-xs">
                          {langPart || 'code'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const name = prompt('Nhập tên file để lưu (vị dụ: App.tsx):');
                            if (name && projectId) {
                              fetch(`/api/workspace/write?projectId=${projectId}`, {
                                method: 'POST',
                                headers: { 
                                  'Content-Type': 'application/json',
                                  'x-username': username || ''
                                },
                                body: JSON.stringify({ name, content: codeString })
                              }).then(res => {
                                if (res.ok) toast.success(`Đã lưu vào ${name}`);
                                else toast.error('Lỗi khi lưu file');
                              });
                            }
                          }}
                          className="bg-bg-tertiary hover:bg-gray-800 text-white text-[10px] font-medium px-2 py-1 rounded shadow-sm flex items-center gap-1 transition-all active:scale-95 border border-border-primary"
                        >
                          <Plus size={10} />
                          Lưu file
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(codeString);
                            toast.success('Đã sao chép vào bộ nhớ tạm');
                          }}
                          className="bg-bg-tertiary hover:bg-gray-700 text-white text-[10px] font-medium px-2 py-1 rounded shadow-sm flex items-center gap-1 transition-all active:scale-95 border border-border-primary"
                        >
                          Sao chép
                        </button>
                      </div>
                    </div>
                    <pre className={cn("rounded-b-xl p-4 overflow-x-auto bg-[#0d0d0d] text-gray-100 text-sm max-w-full border-x border-b border-border-primary shadow-inner", className)}>
                      <code {...props}>{children}</code>
                    </pre>
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
    <div className="h-full flex flex-col relative bg-bg-primary">
      {/* Chat Header */}
      <div className="bg-bg-primary border-b border-border-primary px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-accent-primary rounded flex items-center justify-center">
            <Cpu size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight">Gemini</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSystemPromptExpanded(!isSystemPromptExpanded)}
            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
            title="System Instructions"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      {/* Expanded System Prompt */}
      {activeChatId && isSystemPromptExpanded && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-bg-secondary border-b border-border-primary overflow-hidden"
        >
          <div className="p-4">
            <textarea
              value={activeChat?.systemPrompt || ''}
              onChange={(e) => onUpdateSystemPrompt(e.target.value)}
              placeholder="Enter system instructions..."
              className="w-full h-32 bg-bg-tertiary border border-border-primary rounded-xl p-3 text-sm text-text-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary outline-none transition-all resize-none font-mono"
            />
          </div>
        </motion.div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth no-scrollbar">
        {!activeChatId ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xs mx-auto space-y-6">
            <div className="w-16 h-16 bg-bg-tertiary border border-border-primary rounded-2xl flex items-center justify-center text-accent-primary shadow-xl">
              <Cpu size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">New Chat</h2>
              <p className="text-sm text-text-secondary">
                Select a model to start a new conversation.
              </p>
            </div>
            <button 
              onClick={createNewChat}
              className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-blue-600 text-white py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-900/20"
            >
              <Plus size={18} />
              Start Chatting
            </button>
          </div>
        ) : (
          <div className="w-full space-y-8">
            {activeChat?.messages.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} 
                className="flex flex-col w-full"
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-[10px] font-medium text-text-secondary">
                      {activeChat.model} • Ran for {Math.floor(Math.random() * 2000)}s
                    </span>
                  </div>
                )}
                
                <div className={cn(
                  "flex gap-3 w-full",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}>
                  <div className={cn(
                    "flex-1 min-w-0 max-w-[90%] p-5 rounded-3xl relative group/msg",
                    msg.role === 'user' 
                      ? "bg-bg-tertiary border border-border-primary text-text-primary" 
                      : "text-text-primary"
                  )}>
                    {msg.role === 'assistant' && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => toggleSpeech(msg.content, i)}
                          className={cn(
                            "p-1.5 bg-bg-tertiary border border-border-primary rounded-lg text-text-secondary hover:text-accent-primary transition-all",
                            speakingMessageIndex === i && "text-accent-primary"
                          )}
                        >
                          {speakingMessageIndex === i ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                      </div>
                    )}
                    {msg.images && msg.images.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {msg.images.map((img, idx) => (
                          <div key={idx} className="relative group/img">
                            <img 
                              src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`} 
                              alt="Uploaded" 
                              className="max-w-full rounded-2xl border border-border-primary shadow-sm max-h-64 object-contain bg-bg-secondary"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-2 text-[10px] text-white border border-white/10">
                              <ImageIcon size={12} />
                              <span>image.png</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="markdown-body leading-relaxed">
                      {renderMessage(msg.content, i === activeChat.messages.length - 1 && (isLoading || isAiTypingGlobally))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {(isLoading || isAiTypingGlobally) && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent-primary text-white animate-pulse">
                  <Cpu size={16} />
                </div>
                <div className="bg-bg-secondary border border-border-primary p-4 rounded-2xl">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-bg-primary border-t border-border-primary">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Suggestion Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button className="p-1.5 text-text-secondary hover:text-text-primary transition-colors shrink-0">
              <Plus size={16} className="rotate-45" />
            </button>
            <div className="flex items-center gap-2">
              {[
                { label: 'AI Features', icon: <Sparkles size={12} className="text-blue-400" /> },
                { label: 'Fetch Models', icon: null },
                { label: 'Implement Pull Model', icon: null }
              ].map((chip, idx) => (
                <button 
                  key={idx}
                  className="flex items-center gap-2 px-4 py-2 bg-bg-secondary border border-border-primary rounded-full text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-all whitespace-nowrap"
                >
                  {chip.icon && chip.icon}
                  {chip.label}
                </button>
              ))}
            </div>
            <button className="p-1.5 text-text-secondary hover:text-text-primary transition-colors shrink-0 ml-auto">
              <ChevronDown size={16} className="-rotate-90" />
            </button>
            <button className="p-1.5 text-text-secondary hover:text-text-primary transition-colors shrink-0">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={onSendMessage} className="space-y-3">
            {selectedImage && (
              <div className="relative inline-block">
                <img 
                  src={selectedImage} 
                  alt="Selected" 
                  className="h-20 w-20 object-cover rounded-xl border border-accent-primary shadow-lg"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            
            <div className={cn(
              "relative flex flex-col bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden transition-all focus-within:border-accent-primary/50 focus-within:ring-1 focus-within:ring-accent-primary/50",
              (!activeChatId || isLoading || isAiTypingGlobally || isGloballyBusy) && "opacity-50"
            )}>
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSendMessage();
                  }
                }}
                placeholder="Make changes, add new features, ask for anything"
                disabled={!activeChatId || isLoading || isAiTypingGlobally || isGloballyBusy || activeChat?.isClosed}
                rows={1}
                className="w-full bg-transparent border-none focus:ring-0 p-5 text-sm text-text-primary resize-none min-h-[60px] max-h-[200px] placeholder:text-text-secondary/60"
              />
              
              <div className="flex items-center justify-end gap-2 px-4 pb-4">
                <button
                  type="button"
                  className="p-2.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition-all border border-border-primary/50"
                >
                  <MousePointer2 size={18} />
                </button>
                <button
                  type="button"
                  onClick={toggleListening}
                  className={cn(
                    "p-2.5 rounded-xl transition-all border border-border-primary/50",
                    isListening ? "bg-red-500/10 text-red-500 border-red-500/20" : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                  )}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition-all border border-border-primary/50"
                >
                  <Plus size={18} />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || isAiTypingGlobally || isGloballyBusy || !activeChatId || activeChat?.isClosed}
                  className="p-2.5 bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 rounded-xl transition-all shadow-sm"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
