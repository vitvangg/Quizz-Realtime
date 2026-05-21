'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flag, Search, AlertTriangle, CheckCircle, Clock, Trash2, RefreshCw, Info } from 'lucide-react';
import api from '@/lib/axios';

interface Report {
  id: string;
  type: 'quiz' | 'user';
  reason: string;
  targetId: string;
  targetName: string;
  reportedBy: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
}

const STATUS_CONFIG = {
  PENDING: { label: 'Chờ xử lý', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: Clock },
  RESOLVED: { label: 'Đã xử lý', color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle },
  DISMISSED: { label: 'Bỏ qua', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Trash2 },
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await api.get(`/admin/system/reports${params}`);
      setReports(res.data.reports || []);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Không thể tải danh sách báo cáo');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleUpdateStatus = async (id: string, status: Report['status']) => {
    setUpdatingId(id);
    try {
      await api.patch(`/admin/system/reports/${id}/status`, { status });
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e: any) {
      alert('Lỗi: ' + (e.response?.data?.message || e.message));
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = reports.filter(r => {
    const matchSearch = !search ||
      r.targetName?.toLowerCase().includes(search.toLowerCase()) ||
      r.reason?.toLowerCase().includes(search.toLowerCase()) ||
      r.reportedBy?.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const pendingCount = reports.filter(r => r.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-black pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-black">Moderation / Reports</h1>
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full border-2 border-black animate-pulse">
                {pendingCount} chờ xử lý
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Xử lý báo cáo vi phạm từ người dùng: nội dung xấu, spam, bản quyền
          </p>
        </div>
        <button
          onClick={fetchReports}
          className="flex items-center gap-1.5 rounded-lg border-4 border-black bg-neon-yellow px-3 py-2 text-xs font-black shadow-brutal-sm hover:bg-neon-pink transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border-4 border-red-500 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      {/* Stats tabs */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`rounded-xl border-4 border-black p-4 shadow-brutal-sm text-left transition-transform hover:-translate-y-0.5 ${statusFilter === 'ALL' ? 'bg-black text-white' : 'bg-white'}`}
        >
          <p className="text-xs font-black uppercase">Tất cả</p>
          <p className="text-2xl font-black mt-1">{reports.length}</p>
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'ALL' : key)}
            className={`rounded-xl border-4 border-black p-4 shadow-brutal-sm text-left transition-transform hover:-translate-y-0.5 ${statusFilter === key ? 'bg-black text-white' : 'bg-white'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <cfg.icon className="h-4 w-4" />
              <span className="text-xs font-black uppercase">{cfg.label}</span>
            </div>
            <p className="text-2xl font-black">{reports.filter(r => r.status === key).length}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên, lý do, người báo cáo..."
          className="w-full pl-9 pr-3 h-9 border-2 border-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Đang tải...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <Flag className="h-8 w-8 opacity-30" />
          <p className="text-sm">{reports.length === 0 ? 'Chưa có báo cáo nào' : 'Không tìm thấy kết quả'}</p>
          {reports.length === 0 && (
            <p className="text-xs text-gray-300">Người dùng có thể gửi báo cáo qua game interface</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(report => {
            const statusCfg = STATUS_CONFIG[report.status];
            return (
              <div key={report.id} className={`rounded-xl border-4 border-black bg-white shadow-brutal-sm p-5 ${
                report.status === 'PENDING' ? 'border-l-yellow-400' : ''
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded border font-black ${
                        report.type === 'quiz'
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-purple-100 text-purple-700 border-purple-300'
                      }`}>
                        {report.type === 'quiz' ? '📚 QUIZ' : '👤 USER'}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded border font-bold ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{formatDate(report.createdAt)}</span>
                    </div>

                    <div>
                      <p className="font-black text-black">{report.reason}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Đối tượng: <span className="font-bold text-gray-700">{report.targetName}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Báo cáo bởi: {report.reportedBy}</p>
                    </div>
                  </div>

                  {report.status === 'PENDING' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleUpdateStatus(report.id, 'RESOLVED')}
                        disabled={updatingId === report.id}
                        className="text-xs font-black px-3 py-1.5 rounded-lg border-2 border-black bg-neon-green hover:bg-green-300 transition-colors disabled:opacity-50"
                      >
                        {updatingId === report.id ? '…' : '✓ Xử lý xong'}
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(report.id, 'DISMISSED')}
                        disabled={updatingId === report.id}
                        className="text-xs font-black px-3 py-1.5 rounded-lg border-2 border-black bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        {updatingId === report.id ? '…' : '✗ Bỏ qua'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
