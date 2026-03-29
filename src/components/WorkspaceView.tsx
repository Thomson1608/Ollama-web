import React, { useEffect, useState } from 'react';
import { Folder, File, Trash2, RefreshCw, FileText, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkspaceFile } from '../types';
import { toast } from 'sonner';

interface WorkspaceViewProps {
  refreshTrigger?: number;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ refreshTrigger }) => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

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
  }, [refreshTrigger]);

  const readFile = async (name: string) => {
    setSelectedFile(name);
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

  const deleteFile = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      const res = await fetch(`/api/workspace/delete?name=${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('File deleted');
        if (selectedFile === name) {
          setSelectedFile(null);
          setFileContent('');
        }
        fetchFiles();
      }
    } catch (error) {
      toast.error('Failed to delete file');
    }
  };

  return (
    <div className="flex h-full bg-white overflow-hidden">
      {/* File List */}
      <div className="w-64 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Folder size={16} className="text-blue-500" />
            Workspace
          </h2>
          <button 
            onClick={fetchFiles}
            className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {files.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">
              Workspace is empty
            </div>
          ) : (
            files.map(file => (
              <div 
                key={file.name}
                className={`group flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-all ${
                  selectedFile === file.name ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50 text-gray-600"
                }`}
                onClick={() => readFile(file.name)}
              >
                <File size={14} className={selectedFile === file.name ? "text-blue-500" : "text-gray-400"} />
                <span className="flex-1 truncate">{file.name}</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFile(file.name);
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
          <>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-blue-500" />
                <span className="text-sm font-medium text-gray-700">{selectedFile}</span>
              </div>
            </div>
            <div className="flex-1 p-6 overflow-hidden">
              <div className="h-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <textarea 
                  value={fileContent}
                  readOnly
                  className="flex-1 p-6 font-mono text-sm text-gray-800 focus:outline-none resize-none bg-transparent"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-300">
              <Plus size={32} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Select a file to view its content</p>
              <p className="text-xs">Agent-generated files will appear here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
