'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/axios';
import {
  Users, BookOpen, Gamepad2, ShieldOff,
  Activity, Wifi, WifiOff, RefreshCw,
  TrendingUp, AlertTriangle, Server
} from 'lucide-react';
import Link from 'next/link';

interface OverviewData {
  totalUsers: number;
  totalQuizzes: number;
  activeSessions: number;
  totalPlayersOnline: number;
  bannedIpsCount: number;
  connectedAdmins: number;
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
  href,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: any;
  color: string;
  href?: string;
}) {
  const content = (
    <div className={`rounded-xl border-4 border-black bg-white p-5 shadow-brutal transition-transform hover:-translate-y-1 ${href ? 'cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-black uppercase tracking-widest text-gray-500">{title}</p>
        <div className={`rounded-lg border-2 border-black p-2 ${color}`}>
          <Icon className="h-4 w-4 text-black" />
        </div>
      </div>
      <p className="text-3xl font-black text-black tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get('/admin/system/incident/overview');
      setData(res.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const t = setInterval(fetchOverview, 10000); // auto-refresh 10s
    return () => clearInterval(t);
  }, [fetchOverview]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-black pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-black">Tổng quan chung</h1>
          <p className="mt-1 text-sm text-gray-500">
            Giám sát toàn bộ hệ thống Quizz-Realtime theo thời gian thực
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400 tabular-nums">
              Cập nhật: {formatTime(lastUpdated)}
            </span>
          )}
          <button
            onClick={fetchOverview}
            className="flex items-center gap-1.5 rounded-lg border-4 border-black bg-neon-yellow px-3 py-2 text-xs font-black shadow-brutal-sm hover:bg-neon-orange transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border-4 border-red-500 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      {/* Stats Grid */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl border-4 border-black bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Tổng số người dùng"
            value={data.totalUsers.toLocaleString()}
            sub="Tài khoản đã đăng ký"
            icon={Users}
            color="bg-neon-blue"
            href="/admin/it/users"
          />
          <StatCard
            title="Tổng số Quiz"
            value={data.totalQuizzes.toLocaleString()}
            sub="Bộ câu hỏi đang hoạt động"
            icon={BookOpen}
            color="bg-neon-pink"
            href="/admin/it/quizzes"
          />
          <StatCard
            title="Game đang diễn ra"
            value={data.activeSessions}
            sub={`${data.totalPlayersOnline} người đang chơi`}
            icon={Gamepad2}
            color="bg-neon-green"
            href="/admin/sessions"
          />
          <StatCard
            title="Người chơi online"
            value={data.totalPlayersOnline}
            sub="Trong tất cả phòng đang mở"
            icon={TrendingUp}
            color="bg-neon-yellow"
          />
          <StatCard
            title="IP bị chặn"
            value={data.bannedIpsCount}
            sub="Đang trong danh sách đen"
            icon={ShieldOff}
            color={data.bannedIpsCount > 0 ? 'bg-red-200' : 'bg-gray-100'}
            href="/admin/system"
          />
          <StatCard
            title="Admin đang online"
            value={data.connectedAdmins}
            sub="Kết nối OPS Gateway"
            icon={Server}
            color="bg-purple-200"
          />
        </div>
      ) : null}

      {/* Quick Access */}
      <div>
        <h2 className="mb-4 text-lg font-black text-black uppercase tracking-wider">Truy cập nhanh</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/system"
            className="group rounded-xl border-4 border-black bg-neon-pink p-5 shadow-brutal transition-transform hover:-translate-y-1"
          >
            <div className="flex items-center gap-3 mb-2">
              <Activity className="h-5 w-5" />
              <span className="font-black text-black">System Operations Dashboard</span>
            </div>
            <p className="text-sm text-gray-700">
              Kill Room, Hard Freeze, Maintenance Mode, IP Blacklist, Audit Log — Tất cả công cụ khẩn cấp
            </p>
          </Link>

          <Link
            href="/admin/sessions"
            className="group rounded-xl border-4 border-black bg-neon-blue p-5 shadow-brutal transition-transform hover:-translate-y-1"
          >
            <div className="flex items-center gap-3 mb-2">
              <Gamepad2 className="h-5 w-5" />
              <span className="font-black text-black">Game Sessions Tracker</span>
            </div>
            <p className="text-sm text-gray-700">
              Giám sát trực tiếp các phòng game, xem danh sách người chơi, IP và tốc độ request
            </p>
          </Link>

          <Link
            href="/admin/it/users"
            className="group rounded-xl border-4 border-black bg-neon-green p-5 shadow-brutal transition-transform hover:-translate-y-1"
          >
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-5 w-5" />
              <span className="font-black text-black">Quản lý người dùng</span>
            </div>
            <p className="text-sm text-gray-700">
              Xem, chỉnh sửa, khóa tài khoản. Phân quyền RBAC cho admin
            </p>
          </Link>

          <Link
            href="/admin/audit-logs"
            className="group rounded-xl border-4 border-black bg-neon-yellow p-5 shadow-brutal transition-transform hover:-translate-y-1"
          >
            <div className="flex items-center gap-3 mb-2">
              <ShieldOff className="h-5 w-5" />
              <span className="font-black text-black">Audit Log bảo mật</span>
            </div>
            <p className="text-sm text-gray-700">
              Nhật ký toàn bộ hành động admin: ban IP, kill room, lockdown, maintenance
            </p>
          </Link>
        </div>
      </div>

      {/* System Status */}
      <div className="rounded-xl border-4 border-black bg-white p-5 shadow-brutal">
        <h2 className="mb-4 font-black text-black uppercase tracking-wider text-sm">Trạng thái hệ thống</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Database', status: true, note: 'PostgreSQL' },
            { label: 'Cache', status: true, note: 'Redis' },
            { label: 'WebSocket', status: !!data, note: '/game /admin-ops' },
            { label: 'API Server', status: !!data, note: 'NestJS' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className={`rounded-full border-2 border-black p-1 ${item.status ? 'bg-neon-green' : 'bg-red-300'}`}>
                {item.status ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              </div>
              <div>
                <p className="text-xs font-black">{item.label}</p>
                <p className="text-[10px] text-gray-500">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
