import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Send, Loader2 } from 'lucide-react';

export function StatsView() {
  const [stats, setStats] = useState({ sent: 0, success: 0, fail: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [logType, setLogType] = useState<'all' | 'debug' | 'release' | 'error'>('all');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async (type: string) => {
    try {
      const res = await fetch(`/api/logs?type=${type}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const statsRes = await fetch('/api/stats');
        const statsData = await statsRes.json();
        setStats(statsData);
        await fetchLogs(logType);
      } catch (error) {
        console.error('Failed to fetch stats/logs', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [logType]);

  if (loading && logs.length === 0) return <div className="p-4 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading stats...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center gap-3">
          <Send className="text-blue-500" />
          <div>
            <p className="text-sm text-gray-500">Sent</p>
            <p className="text-2xl font-bold">{stats.sent}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center gap-3">
          <CheckCircle className="text-green-500" />
          <div>
            <p className="text-sm text-gray-500">Success</p>
            <p className="text-2xl font-bold">{stats.success}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center gap-3">
          <AlertCircle className="text-red-500" />
          <div>
            <p className="text-sm text-gray-500">Failed</p>
            <p className="text-2xl font-bold">{stats.fail}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">System Logs</h3>
        <div className="flex gap-2">
          {(['all', 'debug', 'release', 'error'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setLogType(type)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                logType === type
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[500px] overflow-y-auto">
        {logs.length > 0 ? (
          logs.map((log, i) => {
            let color = "text-gray-300";
            if (log.includes('[ERROR]')) color = "text-red-400";
            if (log.includes('[RELEASE]')) color = "text-green-400";
            if (log.includes('[DEBUG]')) color = "text-blue-400";
            
            return (
              <div key={i} className={`border-b border-gray-800 py-1 whitespace-pre-wrap ${color}`}>
                {log}
              </div>
            );
          })
        ) : (
          <p className="text-gray-500 italic">No logs found for this category.</p>
        )}
      </div>
    </div>
  );
}
