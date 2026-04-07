import React, { useEffect, useState, useRef } from 'react';
import { Folder, File, Trash2, RefreshCw, FileText, Plus, Play, Code, ChevronRight, ChevronDown, History, ArrowLeft, X, Globe, Settings2 } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkspaceFile } from '../types';
import { toast } from 'sonner';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { cn } from '../lib/utils';
import { Panel, Group, Separator } from 'react-resizable-panels';
import Editor from '@monaco-editor/react';

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
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      {/* Top Bar with Tabs and URL bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-bg-primary shrink-0 z-30">
        <div className="flex bg-bg-tertiary p-1 rounded-lg">
          <button
            onClick={() => setViewMode('web')}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2",
              viewMode === 'web' ? "bg-bg-primary text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            )}
          >
            <Play size={14} />
            Preview
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2",
              viewMode === 'code' ? "bg-bg-primary text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            )}
          >
            <Code size={14} />
            Code
          </button>
        </div>

        {/* URL Bar Style */}
        <div className="flex-1 max-w-xl mx-4 flex items-center gap-2">
          <button 
            onClick={runWorkspace}
            disabled={isLoading}
            className="px-3 py-1.5 bg-accent-primary text-white text-xs font-medium rounded-lg hover:bg-accent-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Play size={14} />
            {isLoading ? 'Starting...' : 'Run Server'}
          </button>
          <div className="flex-1 flex items-center gap-2 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-1.5 text-text-secondary">
            <Globe size={14} />
            <div className="flex-1 text-xs truncate font-mono">
              {viewMode === 'web' ? (previewType === 'node' ? '/' : (selectedFile?.endsWith('.html') ? `/${selectedFile}` : '/index.html')) : (selectedFile || 'No file selected')}
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPreviewKey(prev => prev + 1)}
                className="hover:text-text-primary transition-colors"
              >
                <RefreshCw size={14} />
              </button>
              <button className="hover:text-text-primary transition-colors">
                <ChevronRight size={14} className="rotate-90" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 text-text-secondary hover:text-text-primary transition-colors">
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {viewMode === 'code' ? (
          <Group orientation="horizontal" className="h-full w-full">
            {/* File List Panel */}
            <Panel 
              defaultSize={20} 
              minSize={15} 
              className={cn(
                "h-full bg-bg-secondary flex flex-col transition-all duration-300",
                !isFileListVisible && "hidden"
              )}
            >
              <div className="p-4 border-b border-border-primary flex items-center justify-between shrink-0">
                <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Folder size={14} />
                  Files
                </h2>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={createNewFile}
                    className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5 no-scrollbar">
                {files.length === 0 ? (
                  <div className="text-center py-10 text-text-secondary text-xs">
                    Empty
                  </div>
                ) : (
                  files.filter(f => isVisible(f.name)).map(file => (
                    <div 
                      key={file.name}
                      className={cn(
                        "group flex items-center gap-2 p-2 rounded-lg text-xs transition-all cursor-pointer border border-transparent",
                        selectedFile === file.name 
                          ? "bg-accent-primary/10 text-accent-primary font-medium border-accent-primary/20" 
                          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary hover:border-border-primary/50"
                      )}
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
                          <ChevronRight size={14} className={cn("text-text-secondary transition-transform", expandedFolders.has(file.name) && "rotate-90")} />
                          <Folder size={14} className="text-accent-primary/60" />
                        </div>
                      ) : (
                        <File size={14} className={selectedFile === file.name ? "text-accent-primary" : "text-text-secondary"} />
                      )}
                      <span className="flex-1 truncate">{file.name.split('/').pop()}</span>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            {isFileListVisible && (
              <Separator className="w-1.5 bg-bg-primary hover:bg-accent-primary/20 transition-colors cursor-col-resize flex items-center justify-center group border-x border-border-primary">
                <div className="w-[1px] h-8 bg-border-primary group-hover:bg-accent-primary transition-colors" />
              </Separator>
            )}

            {/* File Editor Panel */}
            <Panel defaultSize={80} minSize={30} className="flex flex-col bg-bg-primary min-w-0">
              {selectedFile && !selectedIsDirectory ? (
                <>
                  <div className="px-4 py-2 border-b border-border-primary flex items-center justify-between bg-bg-secondary shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-accent-primary" />
                      <span className="text-xs font-medium truncate">{selectedFile}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <button 
                          onClick={saveFile}
                          disabled={isSaving}
                          className="text-[10px] bg-accent-primary text-white px-3 py-1 rounded-md font-medium"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => setIsEditing(true)}
                          className="text-[10px] text-text-secondary hover:text-text-primary px-3 py-1 rounded-md border border-border-primary"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Editor
                      height="100%"
                      defaultLanguage="typescript"
                      language={selectedFile.split('.').pop() === 'js' ? 'javascript' : selectedFile.split('.').pop() === 'ts' ? 'typescript' : selectedFile.split('.').pop() === 'tsx' ? 'typescript' : selectedFile.split('.').pop() === 'html' ? 'html' : selectedFile.split('.').pop() === 'css' ? 'css' : selectedFile.split('.').pop() === 'json' ? 'json' : 'plaintext'}
                      theme="vs-dark"
                      value={fileContent}
                      onChange={(value) => setFileContent(value || '')}
                      options={{
                        readOnly: !isEditing,
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 16 }
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-text-secondary space-y-4">
                  <Code size={48} className="opacity-20" />
                  <p className="text-sm">Select a file to edit</p>
                </div>
              )}
            </Panel>
          </Group>
        ) : viewMode === 'web' ? (
          <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
            <div className="flex-1 p-0 overflow-hidden flex flex-col relative">
              <div className={cn(
                "flex-1 bg-white border border-border-primary overflow-hidden",
                isConsoleOpen ? "rounded-t-xl border-b-0" : "rounded-xl"
              )}>
                <iframe 
                  key={previewKey}
                  src={previewType === 'node' ? `/workspace-preview/${username}/?t=${previewKey}` : (selectedFile?.endsWith('.html') ? `/preview/${username}/${projectId}/${selectedFile.split('/').map(encodeURIComponent).join('/')}?t=${previewKey}` : `/preview/${username}/${projectId}/index.html?t=${previewKey}`)} 
                  className="w-full h-full border-none"
                  title="Web Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
              
              {isConsoleOpen && (
                <div className="h-40 bg-bg-secondary border border-border-primary rounded-b-xl overflow-hidden flex flex-col shrink-0 shadow-xl">
                  <div className="px-4 py-2 bg-bg-tertiary border-b border-border-primary flex items-center justify-between">
                    <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest">Terminal</span>
                    <button 
                      onClick={() => setIsConsoleOpen(false)}
                      className="text-text-secondary hover:text-text-primary"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto font-mono text-[10px] text-green-400 whitespace-pre-wrap no-scrollbar">
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
          <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
            {/* History View Logic */}
            <div className="p-4 text-center text-text-secondary">
              History view coming soon...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
