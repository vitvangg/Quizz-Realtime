'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/axios';
import { RefreshCw, Search, Download, Shield, Zap, Lock, Settings, AlertTriangle, Info } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  ipAddress?: string;
  userId?: string;
  details?: string;
  createdAt: string;
  entity?: string;
}

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  MANUAL_IP_BAN: { label: 'Ban IP thủ công', color: 'text-red-600 bg-red-50 border-red-200', icon: '🛑' },
  AUTO_IP_BAN: { label: 'Auto-ban IP', color: 'text-red-700 bg-red-100 border-red-300', icon: '🤖' },
  IP_UNBAN: { label: 'Gỡ ban IP', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: '✅' },
  KILL_SWITCH: { label: 'Kill Switch', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: '⚡' },
  LOCKDOWN_ENABLE: { label: 'Hard Freeze BẬT', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: '🔒' },
  LOCKDOWN_DISABLE: { label: 'Hard Freeze TẮT', color: 'text-green-600 bg-green-50 border-green-200', icon: '🔓' },
  MAINTENANCE_ENABLE: { label: 'Maintenance BẬT', color: 'text-purple-600 bg-purple-50 border-purple-200', icon: '🔧' },
  MAINTENANCE_DISABLE: { label: 'Maintenance TẮT', color: 'text-green-600 bg-green-50 border-green-200', icon: '✔️' },
};

const FILTERS = ['Tất cả', 'BAN', 'KILL', 'LOCKDOWN', 'MAINTENANCE', 'UNBAN'];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Tất cả');
  const [limit, setLimit] = useState(50);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/system/audit-log/security?limit=${limit}`);
      setLogs(Array.isArray(res.data) ? res.data : []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Failed to fetch audit logs', e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filtered = logs.filter(log => {
    const matchFilter = filter === 'Tất cả' || log.action?.includes(filter);
    const matchSearch = !search ||
      log.action?.toLowerCase().includes(search.toLowerCase()) ||
      log.ipAddress?.includes(search) ||
      log.details?.toLowerCase().includes(search.toLowerCase()) ||
      log.userId?.includes(search);
    return matchFilter && matchSearch;
  });

  const handleExportCsv = () => {
    const header = 'Thời gian,Hành động,IP,User ID,Chi tiết\n';
    const rows = filtered.map(log =>
      `"${new Date(log.createdAt).toLocaleString('vi-VN')}","${log.action}","${log.ipAddress || ''}","${log.userId || ''}","${log.details || ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-black pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-black">Audit Log bảo mật</h1>
          <p className="mt-1 text-sm text-gray-500">
            Nhật ký toàn bộ hành động admin: ban IP, kill room, lockdown, maintenance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-400 hidden sm:block">
              {lastUpdated.toLocaleTimeString('vi-VN')}
            </span>
          )}
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 rounded-lg border-4 border-black bg-neon-blue px-3 py-2 text-xs font-black shadow-brutal-sm hover:bg-neon-pink transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-lg border-4 border-black bg-neon-yellow px-3 py-2 text-xs font-black shadow-brutal-sm hover:bg-neon-orange transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Tổng log', value: logs.length, icon: Info, color: 'bg-neon-blue' },
          { label: 'Ban IP', value: logs.filter(l => l.action?.includes('BAN')).length, icon: Shield, color: 'bg-red-200' },
          { label: 'Kill Switch', value: logs.filter(l => l.action?.includes('KILL')).length, icon: Zap, color: 'bg-orange-200' },
          { label: 'Lockdown', value: logs.filter(l => l.action?.includes('LOCKDOWN')).length, icon: Lock, color: 'bg-yellow-200' },
        ].map(item => (
          <div key={item.label} className={`rounded-xl border-4 border-black p-4 ${item.color} shadow-brutal-sm`}>
            <div className="flex items-center gap-2 mb-1">
              <item.icon className="h-4 w-4" />
              <span className="text-xs font-black uppercase">{item.label}</span>
            </div>
            <p className="text-2xl font-black">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm action, IP, user ID..."
            className="w-full pl-9 pr-3 h-9 border-2 border-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-black px-3 py-1.5 rounded-lg border-2 transition-colors ${filter === f
                ? 'bg-black text-white border-black'
                : 'border-black hover:bg-gray-100'
                }`}
            >
              {f}
            </button>
          ))}
        </div>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="h-9 border-2 border-black rounded-lg text-sm px-2 focus:outline-none"
        >
          <option value={30}>30 entries</option>
          <option value={50}>50 entries</option>
          <option value={100}>100 entries</option>
          <option value={200}>200 entries</option>
        </select>
      </div>

      {/* Log Table */}
      <div className="border-4 border-black rounded-xl overflow-hidden shadow-brutal">
        <div className="bg-black text-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-black">LOG ENTRIES ({filtered.length} / {logs.length})</span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Đang tải...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
              <AlertTriangle className="h-6 w-6 opacity-50" />
              <p className="text-sm">Không tìm thấy log nào</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-black uppercase text-gray-600 w-36">Thời gian</th>
                  <th className="text-left px-4 py-2.5 text-xs font-black uppercase text-gray-600 w-48">Hành động</th>
                  <th className="text-left px-4 py-2.5 text-xs font-black uppercase text-gray-600 w-32">IP Address</th>
                  <th className="text-left px-4 py-2.5 text-xs font-black uppercase text-gray-600">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((log) => {
                  const meta = ACTION_META[log.action] || { label: log.action, color: 'text-gray-700 bg-gray-50 border-gray-200', icon: '📋' };
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border font-bold ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{log.ipAddress || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate" title={log.details}>{log.details || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
