import React, { useState, useEffect, useMemo } from 'react';
import { Terminal, Trash2, Search, Filter, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface LogEntry {
  raw: string;
  timestamp: string;
  level: string;
  message: string;
  date: string;
}

export const SystemLogView: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterTag, setFilterTag] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [clearDate, setClearDate] = useState<string>('');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/logs?type=all');
      if (res.ok) {
        const data = await res.json();
        const parsedLogs = data.logs.map((log: string) => {
          // Example: [DEBUG] 2026-04-07T13:31:32.123Z - Message
          const match = log.match(/^\[(.*?)\]\s([\d:T.-]+Z)\s-\s([\s\S]*)$/);
          if (match) {
            return {
              raw: log,
              level: match[1],
              timestamp: match[2],
              date: match[2].split('T')[0],
              message: match[3]
            };
          }
          return { raw: log, timestamp: '', level: 'INFO', message: log, date: '' };
        }).filter((l: LogEntry) => l.timestamp);
        setLogs(parsedLogs.reverse()); // Newest first
      }
    } catch (error) {
      toast.error('Failed to fetch logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClearLogs = async (date?: string) => {
    try {
      const url = date ? `/api/logs?date=${date}` : '/api/logs';
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        toast.success(date ? `Logs for ${date} cleared` : 'All logs cleared');
        fetchLogs();
      } else {
        toast.error('Failed to clear logs');
      }
    } catch (error) {
      toast.error('Error clearing logs');
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Date filter
      if (startDate && log.date < startDate) return false;
      if (endDate && log.date > endDate) return false;

      // Tag filter
      if (filterTag !== 'all') {
        const msg = log.message.toLowerCase();
        if (filterTag === 'chat') {
          return msg.includes('chat') || msg.includes('request to model') || msg.includes('proxy: starting chat');
        }
        if (filterTag === 'file') {
          return msg.includes('tool read_file') || msg.includes('tool write_file') || msg.includes('tool delete_file') || msg.includes('auto-commit');
        }
        if (filterTag === 'preview') {
          return msg.includes('workspace app') || msg.includes('running workspace') || msg.includes('npm install');
        }
      }

      return true;
    });
  }, [logs, filterTag, startDate, endDate]);

  return (
    <div className="bg-bg-secondary p-6 rounded-xl border border-border-primary shadow-sm flex flex-col h-[calc(100vh-160px)]">
      <div className="flex flex-col md:flex-row gap-4 mb-4 items-start md:items-center justify-between shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-bg-tertiary px-3 py-1.5 rounded-lg border border-border-primary">
            <Filter size={14} className="text-text-secondary" />
            <select 
              value={filterTag} 
              onChange={(e) => setFilterTag(e.target.value)}
              className="bg-transparent text-sm text-text-primary focus:outline-none"
            >
              <option value="all">All Tags</option>
              <option value="chat">Chat Messages</option>
              <option value="file">File Operations</option>
              <option value="preview">Web Preview</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-bg-tertiary px-3 py-1.5 rounded-lg border border-border-primary">
            <Calendar size={14} className="text-text-secondary" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-sm text-text-primary focus:outline-none [color-scheme:dark]"
            />
            <span className="text-text-secondary">-</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-sm text-text-primary focus:outline-none [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-bg-tertiary px-2 py-1 rounded-lg border border-border-primary">
            <input 
              type="date" 
              value={clearDate}
              onChange={(e) => setClearDate(e.target.value)}
              className="bg-transparent text-xs text-text-primary focus:outline-none [color-scheme:dark]"
            />
            <button 
              onClick={() => clearDate && handleClearLogs(clearDate)}
              disabled={!clearDate}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 px-2 py-1"
            >
              Clear Date
            </button>
          </div>
          <button 
            onClick={() => handleClearLogs()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors"
          >
            <Trash2 size={14} />
            Clear All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#0d0d0d] rounded-lg border border-border-primary p-4 font-mono text-xs text-gray-300 space-y-1">
        {isLoading ? (
          <div className="text-center text-text-secondary py-10">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center text-text-secondary py-10">No logs found</div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="break-all whitespace-pre-wrap">
              <span className={
                log.level === 'ERROR' ? 'text-red-400' : 
                log.level === 'DEBUG' ? 'text-gray-500' : 'text-green-400'
              }>[{log.level}]</span>
              <span className="text-blue-400 ml-2">{new Date(log.timestamp).toLocaleString()}</span>
              <span className="ml-2">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
