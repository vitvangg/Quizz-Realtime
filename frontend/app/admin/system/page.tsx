'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/axios';

interface SystemMetrics {
  cpu: number;
  memory: number;
  uptime: number;
  freeMem: number;
  totalMem: number;
  connections: number;
  timestamp: string;
}

interface SystemEvent {
  type: string;
  message: string;
  timestamp: Date;
  user?: string;
}

interface BannedIp {
  ip: string;
  reason: string;
  timestamp: number;
  expiresAt?: number;
}

interface ActiveSession {
  sessionId: string;
  roomId: string;
  status: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  timeLimit: number;
}

interface AuditEntry {
  id: string;
  action: string;
  ipAddress?: string;
  userId?: string;
  details?: string;
  createdAt: string;
}

type Tab = 'controls' | 'sessions' | 'blacklist' | 'audit';

export default function SystemDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [tab, setTab] = useState<Tab>('controls');

  // Controls state
  const [killPin, setKillPin] = useState('');
  const [isLockdown, setIsLockdown] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);

  // Blacklist state
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([]);
  const [manualBanIp, setManualBanIp] = useState('');
  const [manualBanReason, setManualBanReason] = useState('');
  const [manualBanTtl, setManualBanTtl] = useState('24');

  // Sessions state
  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const addEvent = useCallback((event: SystemEvent) => {
    setEvents((prev) => [...prev.slice(-99), event]);
  }, []);

  const fetchBannedIps = useCallback(async () => {
    try {
      const res = await api.get('/admin/system/incident/blacklist');
      setBannedIps(res.data.bannedIps || []);
    } catch { }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/admin/system/incident/sessions');
      setSessions(res.data.sessions || []);
    } catch { }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await api.get('/admin/system/audit-log/security?limit=30');
      setAuditLogs(res.data || []);
    } catch { }
  }, []);

  // Auto-refresh theo tab
  useEffect(() => {
    fetchBannedIps();
    const t1 = setInterval(fetchBannedIps, 10000);
    return () => clearInterval(t1);
  }, [fetchBannedIps]);

  useEffect(() => {
    if (tab === 'sessions') {
      fetchSessions();
      const t = setInterval(fetchSessions, 5000);
      return () => clearInterval(t);
    }
    if (tab === 'audit') {
      fetchAuditLogs();
    }
  }, [tab, fetchSessions, fetchAuditLogs]);

  // WebSocket OPS
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';
    socketRef.current = io(`${wsUrl}/admin-ops`, { transports: ['websocket'] });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      addEvent({ type: 'INFO', message: 'Connected to OPS Gateway', timestamp: new Date() });
    });
    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      addEvent({ type: 'WARN', message: 'Disconnected from OPS Gateway', timestamp: new Date() });
    });
    socketRef.current.on('system:metrics', (data: SystemMetrics) => setMetrics(data));
    socketRef.current.on('system:event', (event: SystemEvent) => {
      addEvent(event);
      // Auto-refresh blacklist nếu có auto-ban event
      if (event.message?.includes('AUTO-BAN') || event.message?.includes('Ban')) fetchBannedIps();
    });

    return () => { socketRef.current?.disconnect(); };
  }, [addEvent, fetchBannedIps]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [events]);

  const handleKillSwitch = async () => {
    const isTargeted = killPin.trim().length > 0;
    if (!confirm(isTargeted ? `Ngắt room [${killPin}]?` : 'GLOBAL KILL — ngắt toàn bộ server?')) return;
    if (!isTargeted && !confirm('Xác nhận lần 2: ngắt toàn bộ?')) return;
    try {
      await api.post('/admin/system/incident/kill-switch', { pin: isTargeted ? killPin : undefined });
      setKillPin('');
      addEvent({ type: 'CRITICAL', message: `Kill Switch: ${isTargeted ? `Room ${killPin}` : 'GLOBAL'}`, timestamp: new Date() });
    } catch (e: any) { alert('Lỗi: ' + e.response?.data?.message); }
  };

  const handleToggleLockdown = async () => {
    const next = !isLockdown;
    if (next && !confirm('Bật Hard Freeze? Màn hình người chơi sẽ bị khóa cứng.')) return;
    try {
      await api.post('/admin/system/incident/lockdown', { enable: next });
      setIsLockdown(next);
    } catch (e: any) { alert('Lỗi: ' + e.response?.data?.message); }
  };

  const handleToggleMaintenance = async () => {
    const next = !isMaintenance;
    if (next && !confirm('Bật Maintenance? Người chơi sẽ bị kick sau 5 giây.')) return;
    try {
      await api.post('/admin/system/incident/maintenance', { enable: next });
      setIsMaintenance(next);
    } catch (e: any) { alert('Lỗi: ' + e.response?.data?.message); }
  };

  const handleKillSession = async (sessionId: string) => {
    if (!confirm(`Kill session ${sessionId.slice(0, 8)}...?`)) return;
    try {
      await api.post('/admin/system/incident/kill-switch', { pin: sessionId });
      fetchSessions();
    } catch { }
  };

  const handleUnban = async (ip: string) => {
    await api.post('/admin/system/incident/unban-ip', { ip });
    fetchBannedIps();
    addEvent({ type: 'INFO', message: `Unbanned: ${ip}`, timestamp: new Date() });
  };

  const handleManualBan = async () => {
    if (!manualBanIp.trim()) return;
    await api.post('/admin/system/incident/ban-ip', {
      ip: manualBanIp,
      reason: manualBanReason || 'Manual',
      ttlHours: parseInt(manualBanTtl) || 24,
    });
    fetchBannedIps();
    addEvent({ type: 'WARNING', message: `Manual ban: ${manualBanIp}`, timestamp: new Date() });
    setManualBanIp(''); setManualBanReason('');
  };

  const fmtBytes = (b: number) => {
    if (!b) return '0';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ['B', 'KB', 'MB', 'GB'][i];
  };

  const fmtUptime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const fmtExpiry = (ts?: number) => {
    if (!ts) return 'Permanent';
    const diff = ts - Date.now();
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  };

  const eventColor = (type: string) => {
    if (type === 'CRITICAL') return 'text-red-400';
    if (type === 'WARNING' || type === 'WARN') return 'text-yellow-400';
    if (type === 'INFO') return 'text-blue-400';
    return 'text-gray-400';
  };

  const cpuPct = metrics?.cpu ?? 0;
  const cpuColor = cpuPct > 80 ? 'text-red-500' : cpuPct > 60 ? 'text-yellow-500' : 'text-green-600';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'controls', label: 'Incident Controls' },
    { key: 'sessions', label: `Active Sessions${sessions.length ? ` (${sessions.length})` : ''}` },
    { key: 'blacklist', label: `IP Blacklist${bannedIps.length ? ` (${bannedIps.length})` : ''}` },
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">System Operations</h1>
          <p className="text-xs text-gray-500">OPS Dashboard — metrics mỗi 3 giây</p>
        </div>
        <div className="flex items-center gap-3">
          {isLockdown && <span className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-0.5 rounded">FROZEN</span>}
          {isMaintenance && <span className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-2 py-0.5 rounded">MAINTENANCE</span>}
          <span className={`flex items-center gap-1.5 text-xs text-gray-500`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'CPU', value: metrics ? `${cpuPct.toFixed(2)}%` : '—', color: cpuColor },
          { label: 'RAM (process)', value: metrics ? fmtBytes(metrics.memory) : '—', color: '' },
          { label: 'System RAM (free)', value: metrics ? `${fmtBytes(metrics.freeMem)}` : '—', color: '' },
          { label: 'WS Connections', value: metrics ? String(metrics.connections) : '—', color: '' },
        ].map((m) => (
          <div key={m.label} className="border rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">{m.label}</p>
            <p className={`text-xl font-mono font-semibold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Event Log */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 flex justify-between items-center">
            <span className="text-sm font-medium">Event Log</span>
            <span className="text-xs text-gray-400">{events.length} entries</span>
          </div>
          <div ref={terminalRef} className="h-52 overflow-y-auto bg-gray-950 p-3 font-mono text-xs space-y-0.5">
            {events.length === 0 && <span className="text-gray-600">Chờ events...</span>}
            {events.map((ev, i) => (
              <div key={i} className="leading-5">
                <span className="text-gray-600">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                {' '}
                <span className={eventColor(ev.type)}>[{ev.type}]</span>
                {' '}
                <span className="text-gray-300">{ev.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">System Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Uptime</span>
              <span className="font-mono">{metrics ? fmtUptime(metrics.uptime) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Active Games</span>
              <span className="font-mono">{sessions.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Banned IPs</span>
              <span className="font-mono">{bannedIps.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hard Freeze</span>
              <span className={isLockdown ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
                {isLockdown ? 'ACTIVE' : 'Off'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Maintenance</span>
              <span className={isMaintenance ? 'text-orange-600 font-medium' : 'text-gray-400'}>
                {isMaintenance ? 'ACTIVE' : 'Off'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-gray-800 text-gray-900 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="border border-t-0 rounded-b-lg p-4">

          {/* ── INCIDENT CONTROLS ── */}
          {tab === 'controls' && (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 block">Kill Switch — nhập PIN để kill room, để trống = Global</label>
                  <div className="flex gap-2">
                    <input
                      value={killPin}
                      onChange={(e) => setKillPin(e.target.value)}
                      placeholder="Room PIN (optional)"
                      className="flex-1 h-8 border rounded px-2 text-sm"
                    />
                    <button
                      onClick={handleKillSwitch}
                      className="h-8 px-3 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      {killPin.trim() ? 'Kill Room' : 'Global Kill'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-500 block">Hard Freeze — dừng timer, khóa màn hình người chơi</label>
                  <button
                    onClick={handleToggleLockdown}
                    className={`w-full h-8 text-xs font-semibold rounded border transition-colors ${
                      isLockdown
                        ? 'bg-yellow-50 border-yellow-400 text-yellow-800 hover:bg-yellow-100'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {isLockdown ? '🔒 Đang FREEZE — nhấn để tắt' : 'Bật Hard Freeze'}
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-500 block">Maintenance Mode — kick tất cả người chơi sau 5 giây</label>
                  <button
                    onClick={handleToggleMaintenance}
                    className={`w-full h-8 text-xs font-semibold rounded border transition-colors ${
                      isMaintenance
                        ? 'bg-orange-50 border-orange-400 text-orange-800 hover:bg-orange-100'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {isMaintenance ? '🔧 Đang MAINTENANCE — nhấn để tắt' : 'Bật Maintenance'}
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-3">
                <p className="font-medium text-gray-800">Hướng dẫn sử dụng</p>
                <p><span className="font-medium">Kill Switch:</span> Ngắt kết nối WebSocket. Nhập PIN để chỉ ngắt 1 room, để trống để ngắt toàn bộ server.</p>
                <p><span className="font-medium">Hard Freeze:</span> Tạm dừng game, hiển thị màn hình cảnh báo. Timer câu hỏi được pause, có thể resume khi tắt.</p>
                <p><span className="font-medium">Maintenance:</span> Thông báo bảo trì cho tất cả người chơi, kick sau 5 giây. Không thể join mới khi đang bật.</p>
              </div>
            </div>
          )}

          {/* ── ACTIVE SESSIONS ── */}
          {tab === 'sessions' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">{sessions.length} game đang hoạt động</span>
                <button onClick={fetchSessions} className="text-xs border rounded px-2 py-1 text-gray-500 hover:text-gray-800">Refresh</button>
              </div>
              {sessions.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">Không có game nào đang chạy.</p>
              ) : (
                <div className="divide-y border rounded-lg">
                  {sessions.map((s) => {
                    const elapsed = s.questionStartedAt ? Math.floor((Date.now() - s.questionStartedAt) / 1000) : 0;
                    const remaining = Math.max(0, s.timeLimit - elapsed);
                    return (
                      <div key={s.sessionId} className="flex items-center justify-between px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-800">{s.sessionId.slice(0, 12)}…</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              s.status === 'QUESTION_ACTIVE'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>{s.status}</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            Câu {s.currentQuestionIndex + 1}/{s.totalQuestions}
                            {s.status === 'QUESTION_ACTIVE' && (
                              <span className="ml-2">• ⏱ {remaining}s còn lại</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleKillSession(s.sessionId)}
                          className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded px-2 py-1"
                        >
                          Kill
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── IP BLACKLIST ── */}
          {tab === 'blacklist' && (
            <div className="space-y-3">
              {/* Manual ban form */}
              <div className="flex gap-2">
                <input
                  value={manualBanIp}
                  onChange={(e) => setManualBanIp(e.target.value)}
                  placeholder="IP address"
                  className="h-8 border rounded px-2 text-sm w-40"
                />
                <input
                  value={manualBanReason}
                  onChange={(e) => setManualBanReason(e.target.value)}
                  placeholder="Lý do"
                  className="flex-1 h-8 border rounded px-2 text-sm"
                />
                <select
                  value={manualBanTtl}
                  onChange={(e) => setManualBanTtl(e.target.value)}
                  className="h-8 border rounded px-2 text-sm"
                >
                  <option value="1">1h</option>
                  <option value="6">6h</option>
                  <option value="24">24h</option>
                  <option value="168">7 ngày</option>
                  <option value="720">30 ngày</option>
                </select>
                <button
                  onClick={handleManualBan}
                  disabled={!manualBanIp.trim()}
                  className="h-8 px-3 text-xs font-semibold border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-40"
                >
                  Ban
                </button>
                <button onClick={fetchBannedIps} className="h-8 px-2 text-xs border rounded text-gray-500 hover:text-gray-800">Refresh</button>
              </div>

              {/* List */}
              <div className="max-h-72 overflow-y-auto divide-y border rounded-lg">
                {bannedIps.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">Chưa có IP nào bị ban.</p>
                ) : (
                  bannedIps.map((b) => (
                    <div key={b.ip} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <span className="font-mono text-sm">{b.ip}</span>
                        <span className="text-xs text-gray-400 ml-3">{b.reason}</span>
                        <span className="text-xs text-gray-300 ml-2">• {fmtExpiry(b.expiresAt)}</span>
                      </div>
                      <button
                        onClick={() => handleUnban(b.ip)}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        Unban
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── AUDIT LOG ── */}
          {tab === 'audit' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">{auditLogs.length} entries gần nhất</span>
                <button onClick={fetchAuditLogs} className="text-xs border rounded px-2 py-1 text-gray-500 hover:text-gray-800">Refresh</button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y border rounded-lg font-mono text-xs">
                {auditLogs.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">Chưa có log bảo mật nào.</p>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="px-4 py-2.5 flex gap-4 items-start">
                      <span className="text-gray-400 shrink-0">
                        {new Date(log.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })}
                      </span>
                      <span className={`shrink-0 font-medium ${
                        log.action.includes('BAN') ? 'text-red-500'
                          : log.action.includes('UNBAN') ? 'text-blue-500'
                            : log.action.includes('LOCKDOWN') || log.action.includes('KILL') ? 'text-yellow-600'
                              : 'text-gray-700'
                      }`}>{log.action}</span>
                      {log.ipAddress && <span className="text-gray-500">{log.ipAddress}</span>}
                      {log.details && <span className="text-gray-400 truncate">{log.details}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
