import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  Database, 
  HardDrive, 
  Activity, 
  Terminal as TerminalIcon, 
  Play, 
  Square, 
  RotateCcw, 
  XCircle,
  Loader2,
  Search,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface SystemStats {
  cpu: { currentLoad: number };
  mem: { total: number; free: number; used: number; active: number; available: number };
  fsSize: { fs: string; type: string; size: number; used: number; available: number; use: number; mount: string }[];
}

interface Process {
  pid: number;
  name: number;
  cpu: number;
  mem: number;
  user: string;
}

interface Service {
  name: string;
  running: boolean;
  startmode: string;
  pids: number[];
}

interface SystemControlProps {
  username?: string | null;
}

export const SystemControl: React.FC<SystemControlProps> = ({ username }) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [processes, setProcesses] = useState<any>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<{ type: 'cmd' | 'out' | 'err', text: string }[]>([]);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentUser, setCurrentUser] = useState<string>('unknown');
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'monitor' | 'processes' | 'services' | 'terminal'>('monitor');
  const [processSearch, setProcessSearch] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const [isFixingPermissions, setIsFixingPermissions] = useState(false);

  const fixPermissions = async () => {
    setIsFixingPermissions(true);
    try {
      const res = await fetch('/api/system/fix-permissions', { method: 'POST' });
      if (res.ok) {
        toast.success('Workspace permissions fixed successfully');
      } else {
        const data = await res.json();
        toast.error(`Failed to fix permissions: ${data.error}`);
      }
    } catch (e) {
      toast.error('Failed to fix permissions');
    } finally {
      setIsFixingPermissions(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/system/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  const fetchProcesses = async () => {
    try {
      const res = await fetch('/api/system/processes');
      const data = await res.json();
      setProcesses(data);
    } catch (e) {
      console.error('Failed to fetch processes', e);
    }
  };

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/system/services');
      const data = await res.json();
      setServices(data);
    } catch (e) {
      console.error('Failed to fetch services', e);
    }
  };

  const fetchCurrentUser = async () => {
    if (!username) return;
    try {
      const res = await fetch('/api/system/terminal', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ command: 'whoami' })
      });
      const data = await res.json();
      if (data.stdout) setCurrentUser(data.stdout.trim());
    } catch (e) {}
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchProcesses(), fetchServices(), fetchCurrentUser()]);
      setLoading(false);
    };
    init();

    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [username]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalOutput]);

  const handleKillProcess = async (pid: number) => {
    if (!username) return;
    if (!confirm(`Are you sure you want to end process ${pid}?`)) return;
    try {
      const res = await fetch('/api/system/processes/kill', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ pid })
      });
      if (res.ok) {
        toast.success(`Process ${pid} terminated`);
        fetchProcesses();
      } else {
        toast.error('Failed to terminate process');
      }
    } catch (e) {
      toast.error('Error connecting to server');
    }
  };

  const handleServiceControl = async (service: string, action: string) => {
    if (!username) return;
    try {
      const res = await fetch('/api/system/services/control', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ service, action })
      });
      if (res.ok) {
        toast.success(`Service ${service} ${action}ed`);
        fetchServices();
      } else {
        const data = await res.json();
        toast.error(`Failed to ${action} service: ${data.error}`);
      }
    } catch (e) {
      toast.error('Error connecting to server');
    }
  };

  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !username) return;

    const cmd = terminalInput;
    setTerminalInput('');
    setTerminalHistory(prev => [cmd, ...prev.filter(h => h !== cmd)].slice(0, 50));
    setHistoryIndex(-1);
    setTerminalOutput(prev => [...prev, { type: 'cmd', text: cmd }]);

    try {
      const res = await fetch('/api/system/terminal', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      if (data.stdout) setTerminalOutput(prev => [...prev, { type: 'out', text: data.stdout }]);
      if (data.stderr) {
        setTerminalOutput(prev => [...prev, { type: 'err', text: data.stderr }]);
        if (data.stderr.includes('sudo: Authentication failed') || data.stderr.includes('sudo: a password is required')) {
          setTerminalOutput(prev => [...prev, { type: 'err', text: 'HINT: To run sudo commands without a password, you need to add your user to the sudoers file with NOPASSWD. Example: "thompson ALL=(ALL) NOPASSWD: ALL"' }]);
        }
      }
      if (data.error) setTerminalOutput(prev => [...prev, { type: 'err', text: data.error }]);
    } catch (e) {
      setTerminalOutput(prev => [...prev, { type: 'err', text: 'Failed to execute command' }]);
    }
  };

  const handleTerminalKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < terminalHistory.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setTerminalInput(terminalHistory[nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setTerminalInput(terminalHistory[nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setTerminalInput('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (!terminalInput.trim() || !username) return;

      try {
        const res = await fetch('/api/system/terminal/complete', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-username': username
          },
          body: JSON.stringify({ command: terminalInput })
        });
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          const lastWord = terminalInput.split(' ').pop() || '';
          const completion = data.suggestions[0];
          
          // If the suggestion starts with the last word, we append the rest
          if (completion.startsWith(lastWord)) {
            const newText = terminalInput.slice(0, -lastWord.length) + completion;
            setTerminalInput(newText);
          } else {
            // Otherwise just append with a space if it's a new word
            setTerminalInput(prev => prev + ' ' + completion);
          }
          
          if (data.suggestions.length > 1) {
            setTerminalOutput(prev => [...prev, { type: 'out', text: data.suggestions.join('  ') }]);
          }
        }
      } catch (e) {
        console.error('Completion failed', e);
      }
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="animate-spin text-blue-500" size={32} />
    </div>
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex overflow-x-auto hide-scrollbar gap-1 md:gap-2 p-1 bg-gray-100 rounded-xl w-full md:w-fit">
          {[
            { id: 'monitor', label: 'Monitor', icon: Activity },
            { id: 'processes', label: 'Processes', icon: Cpu },
            { id: 'services', label: 'Services', icon: Database },
            { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
          ].map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as any)}
              className={cn(
                "flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all whitespace-nowrap flex-1 md:flex-none",
                activeSection === section.id 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <section.icon size={12} className="md:hidden" />
              <section.icon size={14} className="hidden md:block" />
              {section.label}
            </button>
          ))}
        </div>

        <button 
          onClick={fixPermissions}
          disabled={isFixingPermissions}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl transition-all text-xs font-bold border border-amber-200 shadow-sm",
            isFixingPermissions && "opacity-50 cursor-not-allowed"
          )}
        >
          {isFixingPermissions ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
          {isFixingPermissions ? 'Fixing...' : 'Fix Workspace Permissions'}
        </button>
      </div>

      {activeSection === 'monitor' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                <Cpu size={16} className="text-blue-500" />
                CPU Load
              </div>
              <span className="text-xl font-bold text-blue-600">{stats.cpu.currentLoad.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-500" 
                style={{ width: `${stats.cpu.currentLoad}%` }}
              />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                <Activity size={16} className="text-purple-500" />
                Memory
              </div>
              <span className="text-xl font-bold text-purple-600">
                {((stats.mem.used / stats.mem.total) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-purple-500 h-full transition-all duration-500" 
                style={{ width: `${(stats.mem.used / stats.mem.total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 font-medium">
              <span>Used: {formatBytes(stats.mem.used)}</span>
              <span>Total: {formatBytes(stats.mem.total)}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                <HardDrive size={16} className="text-orange-500" />
                Disk Usage
              </div>
              <span className="text-xl font-bold text-orange-600">
                {stats.fsSize[0]?.use.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-orange-500 h-full transition-all duration-500" 
                style={{ width: `${stats.fsSize[0]?.use}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 font-medium">
              <span>Used: {formatBytes(stats.fsSize[0]?.used)}</span>
              <span>Total: {formatBytes(stats.fsSize[0]?.size)}</span>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'processes' && processes && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between bg-gray-50/50 gap-3">
            <h4 className="text-sm font-bold text-gray-700">Running Processes ({processes.list.length})</h4>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search processes..."
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-full"
              />
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-left text-[10px] md:text-xs min-w-[500px] md:min-w-0">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 md:px-4 py-3">PID</th>
                  <th className="px-3 md:px-4 py-3">Name</th>
                  <th className="px-3 md:px-4 py-3">Status</th>
                  <th className="px-3 md:px-4 py-3">CPU%</th>
                  <th className="px-3 md:px-4 py-3">MEM%</th>
                  <th className="px-3 md:px-4 py-3 hidden sm:table-cell">User</th>
                  <th className="px-3 md:px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {processes.list
                  .filter((p: any) => p.name.toLowerCase().includes(processSearch.toLowerCase()) || p.pid.toString().includes(processSearch))
                  .sort((a: any, b: any) => {
                    // Sort by state 'running' first
                    const aRunning = a.state === 'running';
                    const bRunning = b.state === 'running';
                    if (aRunning !== bRunning) return aRunning ? -1 : 1;
                    
                    // Then by CPU usage descending
                    if (b.cpu !== a.cpu) return b.cpu - a.cpu;
                    return b.mem - a.mem;
                  })
                  .map((p: any) => (
                    <tr key={p.pid} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 md:px-4 py-3 font-mono text-gray-500">{p.pid}</td>
                      <td className="px-3 md:px-4 py-3 font-bold text-gray-700 truncate max-w-[100px] md:max-w-none">{p.name}</td>
                      <td className="px-3 md:px-4 py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold border",
                          p.state === 'running' 
                            ? "bg-green-50 text-green-600 border-green-100" 
                            : "bg-gray-50 text-gray-500 border-gray-100"
                        )}>
                          {p.state.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-3">{p.cpu.toFixed(1)}%</td>
                      <td className="px-3 md:px-4 py-3">{p.mem.toFixed(1)}%</td>
                      <td className="px-3 md:px-4 py-3 text-gray-500 hidden sm:table-cell">{p.user}</td>
                      <td className="px-3 md:px-4 py-3 text-right">
                        <button
                          onClick={() => handleKillProcess(p.pid)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="End Process"
                        >
                          <XCircle size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'services' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 bg-gray-50/50">
            <h4 className="text-sm font-bold text-gray-700">System Services</h4>
          </div>
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-left text-[10px] md:text-xs min-w-[400px] md:min-w-0">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 md:px-4 py-3">Service Name</th>
                  <th className="px-3 md:px-4 py-3">Status</th>
                  <th className="px-3 md:px-4 py-3 hidden sm:table-cell">Mode</th>
                  <th className="px-3 md:px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {services
                  .sort((a, b) => {
                    // Sort by running status first (true first)
                    if (a.running !== b.running) return a.running ? -1 : 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((s) => (
                    <tr key={s.name} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 md:px-4 py-3 font-bold text-gray-700 truncate max-w-[120px] md:max-w-none">{s.name}</td>
                    <td className="px-3 md:px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold border",
                        s.running 
                          ? "bg-green-50 text-green-600 border-green-100" 
                          : "bg-gray-50 text-gray-500 border-gray-100"
                      )}>
                        {s.running ? 'RUNNING' : 'STOPPED'}
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-3 text-gray-500 uppercase hidden sm:table-cell">{s.startmode}</td>
                    <td className="px-3 md:px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      {!s.running ? (
                        <button
                          onClick={() => handleServiceControl(s.name, 'start')}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Start Service"
                        >
                          <Play size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleServiceControl(s.name, 'stop')}
                          className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Stop Service"
                        >
                          <Square size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleServiceControl(s.name, 'restart')}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Restart Service"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'terminal' && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col h-[400px] md:h-[500px]">
          <div className="p-3 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 md:w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 md:w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-2.5 h-2.5 md:w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">System Terminal</span>
            </div>
            <div className="text-[9px] md:text-[10px] font-mono text-gray-500">
              User: <span className="text-green-500">{currentUser}</span>
            </div>
          </div>
          <div className="flex-1 p-3 md:p-4 font-mono text-[10px] md:text-xs overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-gray-700">
            <div className="text-gray-500 mb-4">Welcome to System Terminal. Be careful with commands.</div>
            {terminalOutput.map((line, i) => (
              <div key={i} className={cn(
                "whitespace-pre-wrap break-all",
                line.type === 'cmd' ? "text-blue-400 flex gap-2" : 
                line.type === 'err' ? "text-red-400" : "text-gray-300"
              )}>
                {line.type === 'cmd' && <span className="text-green-500 shrink-0">$</span>}
                {line.text}
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
          <form onSubmit={handleTerminalSubmit} className="p-2 md:p-3 bg-gray-800/30 border-t border-gray-800 flex items-center gap-2">
            <span className="text-green-500 font-mono text-[10px] md:text-xs">$</span>
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={handleTerminalKeyDown}
              placeholder="Type a command..."
              className="flex-1 bg-transparent border-none focus:outline-none text-gray-100 font-mono text-[10px] md:text-xs"
              autoFocus
            />
          </form>
        </div>
      )}
    </div>
  );
};
