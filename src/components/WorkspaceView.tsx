import React, { useEffect, useState, useRef } from 'react';
import { Folder, File, Trash2, RefreshCw, FileText, Plus, Play, Code, ChevronRight, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkspaceFile } from '../types';
import { toast } from 'sonner';

import { Socket } from 'socket.io-client';

interface WorkspaceViewProps {
  refreshTrigger?: number;
  socket?: Socket | null;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ refreshTrigger, socket }) => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedIsDirectory, setSelectedIsDirectory] = useState<boolean>(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileContent, setFileContent] = useState<string>('');

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'web'>('code');
  const [previewType, setPreviewType] = useState<'static' | 'node'>('static');
  const [previewKey, setPreviewKey] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;
    
    const handleLog = (log: string) => {
      setLogs(prev => [...prev, log]);
    };

    socket.on('workspace:log', handleLog);
    return () => {
      socket.off('workspace:log', handleLog);
    };
  }, [socket]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/workspace');
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

  useEffect(() => {
    fetchFiles();
    if (selectedFile && !isEditing && !selectedIsDirectory) {
      // Fetch content without resetting preview mode
      fetch(`/api/workspace/read?name=${encodeURIComponent(selectedFile)}`)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          setFileContent(data.content);
          setPreviewKey(prev => prev + 1);
        })
        .catch(() => {});
    }
  }, [refreshTrigger]);

  const readFile = async (name: string) => {
    setSelectedFile(name);
    setSelectedIsDirectory(false);
    setIsEditing(false);
    try {
      const res = await fetch(`/api/workspace/read?name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
      }
    } catch (error) {
      toast.error('Failed to read file');
    }
  };

  const runWorkspace = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/workspace/run', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPreviewType(data.type);
        setViewMode('web');
        setPreviewKey(prev => prev + 1);
      }
    } catch (error) {
      toast.error('Failed to start workspace');
    } finally {
      setIsLoading(false);
    }
  };

  const stopWorkspace = async () => {
    try {
      await fetch('/api/workspace/stop', { method: 'POST' });
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
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/workspace/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (!confirm(`Delete ${isDirectory ? 'folder' : 'file'} ${name}?`)) return;
    try {
      const res = await fetch(`/api/workspace/delete?name=${encodeURIComponent(name)}`, {
        method: 'DELETE'
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
      <div className="flex items-center justify-center p-2 border-b border-gray-100 bg-gray-50/50">
        <div className="flex bg-gray-200/50 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('code')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              viewMode === 'code' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Code size={14} />
              Code
            </div>
          </button>
          <button
            onClick={runWorkspace}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              viewMode === 'web' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Play size={14} />
              Web
            </div>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'code' ? (
          <>
            {/* File List */}
            <div className="w-64 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Folder size={16} className="text-blue-500" />
            Workspace
          </h2>
          <div className="flex items-center gap-1">
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
                if (name) {
                  // To create a folder, we can just write a dummy file or just create the dir via API
                  // For now, let's just use a dummy file .gitkeep or similar
                  fetch('/api/workspace/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
      <div className="flex-1 flex flex-col bg-gray-50/30">
        {selectedFile ? (
          selectedIsDirectory ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4">
              <Folder size={48} className="text-blue-400/60" />
              <p className="text-sm font-medium text-gray-500">Folder: {selectedFile}</p>
            </div>
          ) : (
          <>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-blue-500" />
                <span className="text-sm font-medium text-gray-700">{selectedFile}</span>
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveFile}
                      disabled={isSaving}
                      className="text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium px-3 py-1 rounded-lg shadow-sm disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1 rounded-lg border border-blue-100 hover:bg-blue-50"
                  >
                    Edit File
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 p-6 overflow-hidden">
              <div className="h-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <textarea 
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  readOnly={!isEditing}
                  className={`flex-1 p-6 font-mono text-sm text-gray-800 focus:outline-none resize-none bg-transparent ${isEditing ? 'cursor-text' : 'cursor-default'}`}
                  placeholder="Start typing..."
                />
              </div>
            </div>
          </>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4">
            <div 
              onClick={createNewFile}
              className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-300 hover:bg-blue-50 hover:text-blue-400 cursor-pointer transition-all shadow-sm"
            >
              <Plus size={32} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Select a file or create a new one</p>
              <div className="mt-2 flex gap-2 justify-center">
                <button 
                  onClick={createNewFile}
                  className="text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium px-4 py-2 rounded-lg shadow-sm flex items-center gap-1"
                >
                  <Plus size={14} />
                  New File
                </button>
                <button 
                  onClick={() => {
                    const name = prompt('Enter folder name:');
                    if (name) {
                      fetch('/api/workspace/write', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: `${name}/.gitkeep`, content: '' })
                      }).then(() => fetchFiles());
                    }
                  }}
                  className="text-xs bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm flex items-center gap-1"
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
        ) : (
          <div className="flex-1 flex flex-col bg-gray-50/30">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <Play size={16} className="text-purple-500" />
                <span className="text-sm font-medium text-gray-700">
                  {previewType === 'node' ? 'Node.js App Preview' : 'Static Preview'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPreviewKey(prev => prev + 1)}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"
                >
                  <RefreshCw size={14} />
                  Reload
                </button>
                {previewType === 'node' && (
                  <button 
                    onClick={stopWorkspace}
                    className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded-lg border border-red-100 hover:bg-red-50"
                  >
                    Stop Server
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
              <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <iframe 
                  key={previewKey}
                  src={previewType === 'node' ? '/workspace-preview/' : (selectedFile?.endsWith('.html') ? `/preview/${selectedFile.split('/').map(encodeURIComponent).join('/')}` : '/preview/index.html')} 
                  className="w-full h-full border-none bg-white"
                  title="Web Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
              {previewType === 'node' && (
                <div className="h-48 bg-gray-900 rounded-xl shadow-inner overflow-hidden flex flex-col">
                  <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
                    <span className="text-xs font-mono text-gray-400">Terminal Output</span>
                    <button 
                      onClick={() => setLogs([])}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap">
                    {logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
