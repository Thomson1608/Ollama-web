import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Send, Loader2 } from 'lucide-react';

export function StatsView() {
  const [stats, setStats] = useState({ sent: 0, success: 0, fail: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, logsRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/logs/errors')
        ]);
        const statsData = await statsRes.json();
        const logsData = await logsRes.json();
        setStats(statsData);
        setLogs(logsData.logs);
      } catch (error) {
        console.error('Failed to fetch stats/logs', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-4 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading stats...</div>;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Chat Statistics</h2>
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

      <h3 className="text-xl font-bold">Recent Error Logs</h3>
      <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-xs overflow-x-auto">
        {logs.length > 0 ? (
          logs.map((log, i) => <div key={i} className="border-b border-gray-800 py-1">{log}</div>)
        ) : (
          <p>No recent errors.</p>
        )}
      </div>
    </div>
  );
}
