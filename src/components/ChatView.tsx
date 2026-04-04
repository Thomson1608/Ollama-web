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
  Check
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
      <div className="my-3 inline-flex max-w-full items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm overflow-hidden">
        <div className="shrink-0">{icon}</div>
        <span className="truncate">{text}</span>
      </div>
    );
  } catch (e) {
    return null; // Hide invalid tool calls
  }
};

const FileCodeBlock = ({ filename, code, username, isFinished }: { filename: string, code: string, username: string | null | undefined, isFinished: boolean }) => {
  const [status, setStatus] = useState<'idle' | 'writing' | 'saved' | 'error'>('idle');
  const writtenRef = useRef(false);
  const lastCodeRef = useRef(code);

  useEffect(() => {
    if (code !== lastCodeRef.current) {
      lastCodeRef.current = code;
      if (status === 'saved') {
        writtenRef.current = false;
        setStatus('idle');
      }
    }

    if (isFinished && !writtenRef.current && status === 'idle' && code.trim()) {
      const writeFile = async () => {
        setStatus('writing');
        try {
          const res = await fetch('/api/workspace/write', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-username': username || ''
            },
            body: JSON.stringify({ name: filename, content: code })
          });
          if (res.ok) {
            setStatus('saved');
            writtenRef.current = true;
          } else {
            setStatus('error');
          }
        } catch (err) {
          setStatus('error');
        }
      };
      writeFile();
    }
  }, [isFinished, filename, code, username, status]);

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
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-bold text-gray-800 truncate">{filename}</span>
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
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
  username
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

                // Try to extract filename from language-filename pattern or common patterns
                const langPart = match ? match[1] : '';
                const fullClassName = className || '';
                const filenameMatch = fullClassName.match(/language-[\w.]+:(.+)/);
                let filename = filenameMatch ? filenameMatch[1] : null;

                // Fallback: search for filename in the text immediately preceding the code block
                if (!filename) {
                  const messageContent = activeChat?.messages.find(m => m.content.includes(codeString))?.content || '';
                  if (messageContent) {
                    const beforeCode = messageContent.split(codeString)[0];
                    const fileRegex = /(?:file|save to|create|update|1\.|2\.|3\.|4\.|5\.)\s+`?([\w./-]+\.[\w]+)`?/i;
                    const fileMatch = beforeCode.match(fileRegex);
                    if (fileMatch) {
                      filename = fileMatch[1];
                    }
                  }
                }

                if (filename) {
                  return (
                    <FileCodeBlock 
                      filename={filename} 
                      code={codeString} 
                      username={username} 
                      isFinished={!isStreaming} 
                    />
                  );
                }

                return (
                  <div className="relative group/code my-8">
                    <div className="flex items-center justify-between bg-gray-800 text-gray-300 px-4 py-2 rounded-t-xl border-x border-t border-gray-700">
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
                            const name = prompt('Enter filename to save this code to (e.g., App.tsx):');
                            if (name) {
                              fetch('/api/workspace/write', {
                                method: 'POST',
                                headers: { 
                                  'Content-Type': 'application/json',
                                  'x-username': username || ''
                                },
                                body: JSON.stringify({ name, content: codeString })
                              }).then(res => {
                                if (res.ok) toast.success(`Saved to ${name}`);
                              });
                            }
                          }}
                          className="bg-gray-700 hover:bg-gray-800 text-white text-[10px] font-medium px-2 py-1 rounded shadow-sm flex items-center gap-1 transition-all active:scale-95"
                        >
                          <Plus size={10} />
                          Save
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(codeString);
                            toast.success('Copied to clipboard');
                          }}
                          className="bg-gray-700 hover:bg-gray-600 text-white text-[10px] font-medium px-2 py-1 rounded shadow-sm flex items-center gap-1 transition-all active:scale-95"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <pre className={cn("rounded-b-xl p-4 overflow-x-auto bg-gray-900 text-gray-100 text-sm max-w-full border-x border-b border-gray-800 shadow-inner", className)}>
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
    <div className="h-full flex flex-col relative">
      {/* Chat Header / System Prompt */}
      {activeChatId && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex-1 flex items-center gap-3 overflow-hidden">
            <button 
              onClick={() => setIsSystemPromptExpanded(!isSystemPromptExpanded)}
              className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors shrink-0"
            >
              <div className={cn(
                "w-6 h-6 rounded bg-blue-50 flex items-center justify-center text-blue-600 transition-transform",
                isSystemPromptExpanded && "rotate-180"
              )}>
                <ChevronDown size={14} />
              </div>
              System Instruction
            </button>
            {!isSystemPromptExpanded && (
              <span className="text-xs text-gray-400 truncate italic">
                {activeChat?.systemPrompt || "Default system instructions active..."}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expanded System Prompt */}
      {activeChatId && isSystemPromptExpanded && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-gray-50 border-b border-gray-200 overflow-hidden"
        >
          <div className="p-4 max-w-3xl mx-auto">
            <textarea
              value={activeChat?.systemPrompt || ''}
              onChange={(e) => onUpdateSystemPrompt(e.target.value)}
              placeholder="Enter system instructions to guide the model's behavior..."
              className="w-full h-32 bg-white border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none font-mono"
            />
            <div className="flex justify-end mt-2">
              <button 
                onClick={() => setIsSystemPromptExpanded(false)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex-1 overflow-y-auto p-2 md:p-6 space-y-4 md:space-y-6">
        {!activeChatId ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 md:space-y-6 px-4">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-100 rounded-xl md:rounded-2xl flex items-center justify-center text-blue-600">
              <Cpu size={28} className="md:hidden" />
              <Cpu size={32} className="hidden md:block" />
            </div>
            <div className="space-y-1 md:space-y-2">
              <h2 className="text-xl md:text-2xl font-bold text-gray-800">AI Chat Interface</h2>
              <p className="text-xs md:text-sm text-gray-500">
                Select a model from the Models tab to start.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 w-full">
              <button 
                onClick={createNewChat}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white p-2.5 md:p-3 rounded-xl text-sm md:text-base font-medium transition-all shadow-lg shadow-blue-200"
              >
                <Plus size={18} />
                New Conversation
              </button>
            </div>
            {connectionStatus === 'disconnected' && (
              <div className="p-3 md:p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-left">
                <AlertCircle className="text-red-500 shrink-0" size={18} />
                <div className="text-[11px] md:text-sm">
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
          <div className="max-w-3xl mx-auto w-full space-y-4 md:space-y-6 overflow-x-hidden">
            {activeChat?.messages.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} 
                className={cn(
                  "flex gap-2 md:gap-4 w-full overflow-hidden items-start",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 text-xs md:text-sm",
                  msg.role === 'user' 
                    ? "bg-gray-800 text-white" 
                    : "bg-blue-100 text-blue-600"
                )}>
                  {msg.role === 'user' ? 'U' : (
                    <>
                      <Cpu size={14} className="md:hidden" />
                      <Cpu size={16} className="hidden md:block" />
                    </>
                  )}
                </div>
                <div className={cn(
                  "flex-1 min-w-0 max-w-[90%] md:max-w-[80%] p-3 md:p-4 rounded-2xl relative group/msg shadow-sm",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-white border border-gray-200 rounded-tl-none"
                )}>
                  {msg.role === 'assistant' && (
                    <div className="absolute -top-2 -right-2 flex gap-1">
                      <button
                        onClick={() => toggleSpeech(msg.content, i)}
                        className={cn(
                          "p-1.5 bg-white border border-gray-100 rounded-lg shadow-sm text-gray-400 hover:text-blue-600 transition-all md:opacity-0 md:group-hover/msg:opacity-100",
                          speakingMessageIndex === i && "text-blue-600 opacity-100"
                        )}
                        title={speakingMessageIndex === i ? "Dừng đọc" : "Đọc tin nhắn"}
                      >
                        {speakingMessageIndex === i ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                    </div>
                  )}
                  {msg.images && msg.images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {msg.images.map((img, idx) => (
                        <img 
                          key={idx} 
                          src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`} 
                          alt="Uploaded" 
                          className="max-w-full rounded-lg border border-gray-200 shadow-sm max-h-64 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ))}
                    </div>
                  )}
                  <div className={cn("markdown-body text-xs md:text-sm break-words overflow-x-auto", msg.role === 'user' ? "text-white" : "text-gray-800")}>
                    {renderMessage(msg.content, i === activeChat.messages.length - 1 && (isLoading || isAiTypingGlobally))}
                  </div>
                </div>
              </motion.div>
            ))}
            {(isLoading || isAiTypingGlobally) && (
              <div className="flex gap-2 md:gap-4">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 animate-pulse bg-blue-100 text-blue-600">
                  <Cpu size={14} />
                </div>
                <div className="bg-white border p-3 md:p-4 rounded-2xl rounded-tl-none shadow-sm border-gray-200">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-gray-300 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    {isAiTypingGlobally && !isLoading && (
                      <span className="text-[8px] md:text-[10px] font-medium text-gray-400 uppercase tracking-wider">
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
      <div 
        className="shrink-0 bg-gradient-to-t from-[#f5f5f5] via-[#f5f5f5] to-transparent"
        style={{ 
          paddingBottom: 'calc(env(safe-area-inset-bottom) + var(--keyboard-offset, 0px))',
          transition: 'padding-bottom 0.2s ease-out'
        }}
      >
        <form 
          onSubmit={onSendMessage}
          className="max-w-3xl mx-auto w-full p-2 md:p-6"
        >
          {selectedImage && (
            <div className="mb-2 relative inline-block">
              <img 
                src={selectedImage} 
                alt="Selected" 
                className="h-20 w-20 object-cover rounded-lg border-2 border-blue-500 shadow-md"
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
            "flex items-end gap-1 md:gap-2 bg-white border border-gray-200 rounded-2xl p-1.5 md:p-3 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500",
            (!activeChatId || isLoading || isAiTypingGlobally || isGloballyBusy) && "bg-gray-50 opacity-80"
          )}>
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeChatId || isLoading || isAiTypingGlobally || isGloballyBusy}
              className="p-1.5 md:p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all shrink-0 disabled:opacity-50"
              title="Tải ảnh lên"
            >
              <ImageIcon size={20} />
            </button>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSendMessage();
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
              style={{ height: 'auto' }}
              className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 p-1 md:p-2 text-sm resize-none disabled:cursor-not-allowed min-h-[36px] max-h-[200px]"
            />
            <div className="flex items-center gap-0.5 md:gap-1 pb-1 shrink-0">
              <button
                type="button"
                onClick={toggleListening}
                disabled={!activeChatId || isLoading || isAiTypingGlobally || isGloballyBusy}
                className={cn(
                  "p-1.5 md:p-2 rounded-xl transition-all shadow-sm disabled:shadow-none disabled:bg-transparent disabled:text-gray-400 shrink-0",
                  isListening 
                    ? "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
                title={isListening ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isLoading || isAiTypingGlobally || isGloballyBusy || !activeChatId}
                className="p-1.5 md:p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-xl transition-all shadow-lg shadow-blue-200 disabled:shadow-none shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
