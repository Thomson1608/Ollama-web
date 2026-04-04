import React, { useEffect, useState, useRef } from 'react';
import { Folder, File, Trash2, RefreshCw, FileText, Plus, Play, Code, ChevronRight, ChevronDown, History, ArrowLeft, X } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkspaceFile } from '../types';
import { toast } from 'sonner';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { cn } from '../lib/utils';

import { Socket } from 'socket.io-client';

interface WorkspaceViewProps {
  refreshTrigger?: number;
  socket?: Socket | null;
  isMobile?: boolean;
  username?: string | null;
  projectId?: string;
  onInstallDependencies?: () => Promise<void>;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ refreshTrigger, socket, isMobile, username, projectId, onInstallDependencies }) => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedIsDirectory, setSelectedIsDirectory] = useState<boolean>(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileContent, setFileContent] = useState<string>('');

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'web' | 'history'>('code');
  const [previewType, setPreviewType] = useState<'static' | 'node'>('static');
  const [previewKey, setPreviewKey] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);
  const [isFileListVisible, setIsFileListVisible] = useState(!isMobile);
  
  // History state
  const [history, setHistory] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [commitDetails, setCommitDetails] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Auto-check package.json
  useEffect(() => {
    if (!username || !projectId) return;
    
    const checkPackageJson = async () => {
      try {
        const res = await fetch('/api/workspace/check-package-json', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-username': username
          },
          body: JSON.stringify({ projectId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.changed) {
            toast.success('Detected package.json changes. Dependencies updated.');
          }
        }
      } catch (e) {
        console.error('Failed to check package.json', e);
      }
    };

    checkPackageJson();
  }, [projectId, username]);

  useEffect(() => {
    if (!socket || !username) return;
    
    const handleLog = (log: string) => {
      setLogs(prev => [...prev, log]);
    };

    const handleHistoryUpdate = () => {
      if (viewMode === 'history') {
        fetchHistory();
      }
    };

    socket.on(`workspace:log:${username}`, handleLog);
    socket.on(`workspace:history_updated:${username}`, handleHistoryUpdate);
    return () => {
      socket.off(`workspace:log:${username}`, handleLog);
      socket.off(`workspace:history_updated:${username}`, handleHistoryUpdate);
    };
  }, [socket, viewMode, username]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchFiles = async () => {
    if (!username || !projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/workspace?projectId=${projectId}`, {
        headers: { 'x-username': username }
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (error) {
      toast.error('Failed to fetch workspace files');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!username || !projectId) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/workspace/history?projectId=${projectId}`, {
        headers: { 'x-username': username }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history);
      }
    } catch (error) {
      toast.error('Failed to fetch history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchCommitDetails = async (hash: string) => {
    if (!username || !projectId) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/workspace/commit-details?hash=${hash}&projectId=${projectId}`, {
        headers: { 'x-username': username }
      });
      if (res.ok) {
        const data = await res.json();
        setCommitDetails(data.files);
        setSelectedCommit(hash);
      }
    } catch (error) {
      toast.error('Failed to fetch commit details');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'history') {
      fetchHistory();
    }
  }, [viewMode]);

  useEffect(() => {
    fetchFiles();
    if (selectedFile && !isEditing && !selectedIsDirectory && username && projectId) {
      // Fetch content without resetting preview mode
      fetch(`/api/workspace/read?name=${encodeURIComponent(selectedFile)}&projectId=${projectId}`, {
        headers: { 'x-username': username }
      })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          setFileContent(data.content);
          setPreviewKey(prev => prev + 1);
        })
        .catch(() => {});
    }
  }, [refreshTrigger, username, projectId]);

  const readFile = async (name: string) => {
    if (!username || !projectId) return;
    setSelectedFile(name);
    setSelectedIsDirectory(false);
    setIsEditing(false);
    try {
      const res = await fetch(`/api/workspace/read?name=${encodeURIComponent(name)}&projectId=${projectId}`, {
        headers: { 'x-username': username }
      });
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
      }
    } catch (error) {
      toast.error('Failed to read file');
    }
  };

  const runWorkspace = async () => {
    if (!username || !projectId) return;
    setIsLoading(true);
    setViewMode('web'); // Switch immediately for better UX
    try {
      const res = await fetch(`/api/workspace/run?projectId=${projectId}`, { 
        method: 'POST',
        headers: { 'x-username': username }
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewType(data.type);
        setPreviewKey(prev => prev + 1);
      }
    } catch (error) {
      toast.error('Failed to start workspace');
    } finally {
      setIsLoading(false);
    }
  };

  const stopWorkspace = async () => {
    if (!username || !projectId) return;
    try {
      await fetch(`/api/workspace/stop?projectId=${projectId}`, { 
        method: 'POST',
        headers: { 'x-username': username }
      });
    } catch (error) {
      console.error('Failed to stop workspace', error);
    }
  };

  useEffect(() => {
    return () => {
      stopWorkspace();
    };
  }, []);

  const saveFile = async () => {
    if (!selectedFile || !username || !projectId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/workspace/write?projectId=${projectId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ name: selectedFile, content: fileContent })
      });
      if (res.ok) {
        toast.success('File saved');
        setIsEditing(false);
        setPreviewKey(prev => prev + 1);
        fetchFiles();
      }
    } catch (error) {
      toast.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  const createNewFile = () => {
    const name = prompt('Enter file name:');
    if (name) {
      setSelectedFile(name);
      setSelectedIsDirectory(false);
      setFileContent('');
      setIsEditing(true);
    }
  };

  const deleteFile = async (name: string, isDirectory: boolean) => {
    if (!confirm(`Delete ${isDirectory ? 'folder' : 'file'} ${name}?`) || !username || !projectId) return;
    try {
      const res = await fetch(`/api/workspace/delete?name=${encodeURIComponent(name)}&projectId=${projectId}`, {
        method: 'DELETE',
        headers: { 'x-username': username }
      });
      if (res.ok) {
        toast.success(`${isDirectory ? 'Folder' : 'File'} deleted`);
        if (selectedFile === name || selectedFile?.startsWith(name + '/')) {
          setSelectedFile(null);
          setSelectedIsDirectory(false);
          setFileContent('');
        }
        fetchFiles();
      }
    } catch (error) {
      toast.error(`Failed to delete ${isDirectory ? 'folder' : 'file'}`);
    }
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const isVisible = (filePath: string) => {
    const parts = filePath.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (i === 0 ? '' : '/') + parts[i];
      if (!expandedFolders.has(currentPath)) {
        return false;
      }
    }
    return true;
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Top Bar Toggle */}
      <div className="flex items-center justify-center p-2 border-b border-gray-100 bg-gray-50/50 shrink-0 relative z-30">
        <div className="flex bg-gray-200/50 p-1 rounded-lg w-full md:max-w-md">
          <button
            onClick={() => {
              console.log('Switching to code mode');
              setViewMode('code');
            }}
            className={`flex-1 px-3 md:px-4 py-2 md:py-1.5 text-xs md:text-sm font-medium rounded-md transition-all cursor-pointer touch-manipulation ${
              viewMode === 'code' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center gap-1 md:gap-2">
              <Code size={14} />
              <span>Code</span>
            </div>
          </button>
          <button
            onClick={() => {
              console.log('Switching to web mode and running workspace');
              setViewMode('web');
              runWorkspace();
            }}
            className={`flex-1 px-3 md:px-4 py-2 md:py-1.5 text-xs md:text-sm font-medium rounded-md transition-all cursor-pointer touch-manipulation ${
              viewMode === 'web' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center gap-1 md:gap-2">
              <Play size={14} />
              <span>Web</span>
            </div>
          </button>
          <button
            onClick={() => {
              console.log('Switching to history mode');
              setViewMode('history');
            }}
            className={`flex-1 px-3 md:px-4 py-2 md:py-1.5 text-xs md:text-sm font-medium rounded-md transition-all cursor-pointer touch-manipulation ${
              viewMode === 'history' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center gap-1 md:gap-2">
              <History size={14} />
              <span>History</span>
            </div>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {viewMode === 'code' ? (
          <>
            {/* File List */}
            <div className={cn(
              "absolute md:relative z-20 h-full bg-white border-r border-gray-100 flex flex-col transition-all duration-300 shadow-xl md:shadow-none",
              isFileListVisible ? "w-64 translate-x-0" : "w-0 -translate-x-full md:w-0 md:translate-x-0"
            )}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Folder size={16} className="text-blue-500" />
                  Workspace
                </h2>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={async () => {
                      if (onInstallDependencies) {
                        setIsInstalling(true);
                        try {
                          await onInstallDependencies();
                        } finally {
                          setIsInstalling(false);
                        }
                      }
                    }}
                    disabled={isInstalling || !onInstallDependencies}
                    className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400 disabled:opacity-50"
                    title="Install Dependencies"
                  >
                    <RefreshCw size={14} className={isInstalling ? "animate-spin" : ""} />
                  </button>
                  <button 
                    onClick={createNewFile}
                    className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400"
                    title="New File"
                  >
                    <Plus size={14} />
                  </button>
                  <button 
                    onClick={() => {
                      const name = prompt('Enter folder name:');
                      if (name && username) {
                        fetch('/api/workspace/write', {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'x-username': username
                          },
                          body: JSON.stringify({ name: `${name}/.gitkeep`, content: '' })
                        }).then(() => fetchFiles());
                      }
                    }}
                    className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400"
                    title="New Folder"
                  >
                    <Folder size={14} />
                  </button>
                  <button 
                    onClick={fetchFiles}
                    className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400"
                    title="Refresh"
                  >
                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {files.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-xs">
                    Workspace is empty
                  </div>
                ) : (
                  files.filter(f => isVisible(f.name)).map(file => (
                    <div 
                      key={file.name}
                      className={`group flex items-center gap-2 p-2 rounded-lg text-xs transition-all ${
                        selectedFile === file.name 
                          ? "bg-blue-50 text-blue-700 font-medium cursor-pointer" 
                          : "hover:bg-gray-50 text-gray-600 cursor-pointer"
                      }`}
                      style={{ paddingLeft: `${(file.name.split('/').length - 1) * 12 + 8}px` }}
                      onClick={() => {
                        setSelectedFile(file.name);
                        setSelectedIsDirectory(file.isDirectory);
                        if (file.isDirectory) {
                          toggleFolder(file.name);
                        } else {
                          readFile(file.name);
                          if (isMobile) setIsFileListVisible(false);
                        }
                      }}
                    >
                      {file.isDirectory ? (
                        <div className="flex items-center gap-1">
                          {expandedFolders.has(file.name) ? (
                            <ChevronDown size={14} className="text-gray-400" />
                          ) : (
                            <ChevronRight size={14} className="text-gray-400" />
                          )}
                          <Folder size={14} className="text-blue-400/60" />
                        </div>
                      ) : (
                        <File size={14} className={selectedFile === file.name ? "text-blue-500" : "text-gray-400"} />
                      )}
                      <span className="flex-1 truncate">{file.name.split('/').pop()}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFile(file.name, file.isDirectory);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* File Editor/Viewer */}
            <div className="flex-1 flex flex-col bg-gray-50/30 min-w-0">
              {selectedFile ? (
                selectedIsDirectory ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4">
                    <Folder size={48} className="text-blue-400/60" />
                    <p className="text-sm font-medium text-gray-500">Folder: {selectedFile}</p>
                  </div>
                ) : (
                <>
                  <div className="p-3 md:p-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => setIsFileListVisible(!isFileListVisible)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 md:hidden"
                      >
                        <Folder size={18} />
                      </button>
                      <FileText size={16} className="text-blue-500 shrink-0" />
                      <span className="text-xs md:text-sm font-medium text-gray-700 truncate">{selectedFile}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button 
                            onClick={() => setIsEditing(false)}
                            className="text-[10px] md:text-xs text-gray-500 hover:text-gray-700 font-medium px-2 md:px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={saveFile}
                            disabled={isSaving}
                            className="text-[10px] md:text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium px-2 md:px-3 py-1 rounded-lg shadow-sm disabled:opacity-50"
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                        </>
                      ) : (
                        <button 
                          onClick={() => setIsEditing(true)}
                          className="text-[10px] md:text-xs text-blue-600 hover:text-blue-700 font-medium px-2 md:px-3 py-1 rounded-lg border border-blue-100 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 p-3 md:p-6 overflow-hidden">
                    <div className="h-full bg-white rounded-xl md:rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                      <textarea 
                        value={fileContent}
                        onChange={(e) => setFileContent(e.target.value)}
                        readOnly={!isEditing}
                        className={`flex-1 p-4 md:p-6 font-mono text-xs md:text-sm text-gray-800 focus:outline-none resize-none bg-transparent ${isEditing ? 'cursor-text' : 'cursor-default'}`}
                        placeholder="Start typing..."
                      />
                    </div>
                  </div>
                </>
                )
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4 px-4">
                  <div className="flex items-center gap-2 mb-4 md:hidden">
                    <button
                      onClick={() => setIsFileListVisible(!isFileListVisible)}
                      className="p-2 bg-blue-50 text-blue-600 rounded-xl flex items-center gap-2 text-sm font-medium"
                    >
                      <Folder size={18} />
                      Show Files
                    </button>
                  </div>
                  <div 
                    onClick={createNewFile}
                    className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-xl md:rounded-2xl flex items-center justify-center text-gray-300 hover:bg-blue-50 hover:text-blue-400 cursor-pointer transition-all shadow-sm"
                  >
                    <Plus size={28} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs md:text-sm font-medium">Select a file or create a new one</p>
                    <div className="mt-4 flex gap-2 justify-center">
                      <button 
                        onClick={createNewFile}
                        className="text-[10px] md:text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium px-3 md:px-4 py-2 rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Plus size={14} />
                        New File
                      </button>
                      <button 
                        onClick={() => {
                          const name = prompt('Enter folder name:');
                          if (name && username) {
                            fetch('/api/workspace/write', {
                              method: 'POST',
                              headers: { 
                                'Content-Type': 'application/json',
                                'x-username': username
                              },
                              body: JSON.stringify({ name: `${name}/.gitkeep`, content: '' })
                            }).then(() => fetchFiles());
                          }
                        }}
                        className="text-[10px] md:text-xs bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 font-medium px-3 md:px-4 py-2 rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Folder size={14} />
                        New Folder
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : viewMode === 'web' ? (
          <div className="flex-1 flex flex-col bg-gray-50/30 min-w-0">
            <div className="p-3 md:p-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Play size={16} className="text-purple-500 shrink-0" />
                <span className="text-xs md:text-sm font-medium text-gray-700 truncate">
                  {previewType === 'node' ? 'Node.js App' : 'Static Preview'}
                </span>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <button 
                  onClick={() => setPreviewKey(prev => prev + 1)}
                  className="p-1.5 md:px-3 md:py-1 text-gray-500 hover:text-gray-700 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"
                  title="Reload"
                >
                  <RefreshCw size={14} />
                  <span className="hidden md:inline text-xs">Reload</span>
                </button>
                <button 
                  onClick={stopWorkspace}
                  className="p-1.5 md:px-3 md:py-1 text-red-600 hover:text-red-700 font-medium rounded-lg border border-red-100 hover:bg-red-50"
                  title="Stop Server"
                >
                  <span className="text-xs">Stop</span>
                </button>
              </div>
            </div>
            <div className="flex-1 p-3 md:p-6 overflow-hidden flex flex-col gap-4 relative">
              <div className="flex-1 bg-white rounded-xl md:rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <iframe 
                  key={previewKey}
                  src={previewType === 'node' ? `/workspace-preview/${username}/?t=${previewKey}` : (selectedFile?.endsWith('.html') ? `/preview/${username}/${selectedFile.split('/').map(encodeURIComponent).join('/')}?t=${previewKey}` : `/preview/${username}/index.html?t=${previewKey}`)} 
                  className="w-full h-full border-none bg-white"
                  title="Web Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
              
              {!isConsoleOpen && (
                <button
                  onClick={() => setIsConsoleOpen(true)}
                  className="absolute bottom-6 md:bottom-10 right-6 md:right-10 bg-gray-900 text-white px-3 md:px-4 py-2 rounded-xl shadow-xl text-[10px] md:text-xs font-medium flex items-center gap-2 hover:bg-gray-800 transition-all border border-gray-700 z-10"
                >
                  <Code size={14} />
                  Console
                </button>
              )}

              {isConsoleOpen && (
                <div className="h-32 md:h-48 bg-gray-900 rounded-xl shadow-inner overflow-hidden flex flex-col shrink-0">
                  <div className="px-4 py-1.5 md:py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
                    <span className="text-[10px] md:text-xs font-mono text-gray-400">Terminal Output</span>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setLogs([])}
                        className="text-[10px] md:text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Clear
                      </button>
                      <button 
                        onClick={() => setIsConsoleOpen(false)}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Close Console"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 p-3 md:p-4 overflow-y-auto font-mono text-[10px] md:text-xs text-green-400 whitespace-pre-wrap">
                    {logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-gray-50/30 overflow-hidden">
            {selectedCommit ? (
              <div className="flex flex-col h-full">
                <div className="p-3 md:p-4 border-b border-gray-100 flex items-center gap-4 bg-white shrink-0">
                  <button 
                    onClick={() => setSelectedCommit(null)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h3 className="text-xs md:text-sm font-bold text-gray-800">Commit Details</h3>
                    <p className="text-[10px] md:text-xs text-gray-500 font-mono">{selectedCommit.substring(0, 7)}</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">
                  {commitDetails.map((file, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-gray-50 px-3 md:px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                        <FileText size={14} className="text-gray-500" />
                        <span className="text-xs md:text-sm font-medium text-gray-700 truncate">{file.name}</span>
                      </div>
                      <div className="text-[10px] md:text-sm overflow-x-auto">
                        <ReactDiffViewer
                          oldValue={file.oldContent}
                          newValue={file.newContent}
                          splitView={!isMobile}
                          useDarkTheme={false}
                          hideLineNumbers={false}
                        />
                      </div>
                    </div>
                  ))}
                  {commitDetails.length === 0 && (
                    <div className="text-center py-10 text-gray-400 text-xs md:text-sm">
                      No file changes found in this commit.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="p-3 md:p-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0">
                  <h2 className="text-xs md:text-sm font-bold text-gray-700 flex items-center gap-2">
                    <History size={16} className="text-green-500" />
                    Version History
                  </h2>
                  <button 
                    onClick={fetchHistory}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                    title="Refresh History"
                  >
                    <RefreshCw size={14} className={isLoadingHistory ? "animate-spin" : ""} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-4">
                  <div className="space-y-3">
                    {history.map((commit: any) => (
                      <div 
                        key={commit.hash}
                        onClick={() => fetchCommitDetails(commit.hash)}
                        className="bg-white border border-gray-200 p-3 md:p-4 rounded-xl hover:border-green-300 hover:shadow-sm cursor-pointer transition-all group"
                      >
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <h3 className="text-xs md:text-sm font-semibold text-gray-800 group-hover:text-green-700 transition-colors line-clamp-2">
                            {commit.message}
                          </h3>
                          <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded shrink-0">
                            {commit.hash.substring(0, 7)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-500">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate max-w-[100px]">{commit.author_name}</span>
                          </div>
                          <span className="shrink-0">{new Date(commit.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                    {history.length === 0 && !isLoadingHistory && (
                      <div className="text-center py-10 text-gray-400 text-xs md:text-sm">
                        No history available yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
