'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/axios';

interface SystemMetrics {
  cpu: number;
  memory: number;
  uptime: number;
  freeMem: number;
  totalMem: number;
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
}

export default function SystemDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [killPin, setKillPin] = useState('');
  const [isLockdown, setIsLockdown] = useState(false);
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([]);
  const [manualBanIp, setManualBanIp] = useState('');
  const [manualBanReason, setManualBanReason] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchBannedIps();
    const interval = setInterval(fetchBannedIps, 10000);
    return () => clearInterval(interval);
  }, []);

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
    socketRef.current.on('system:event', (event: SystemEvent) => addEvent(event));
    return () => { socketRef.current?.disconnect(); };
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [events]);

  const addEvent = (event: SystemEvent) => setEvents((prev) => [...prev.slice(-49), event]);

  const fetchBannedIps = async () => {
    try {
      const res = await api.get('/admin/system/incident/blacklist');
      setBannedIps(res.data.bannedIps || []);
    } catch { /* ignore */ }
  };

  const handleKillSwitch = async () => {
    const isTargeted = killPin.trim().length > 0;
    if (!confirm(isTargeted ? `Ngắt room [${killPin}]?` : 'GLOBAL KILL — ngắt toàn bộ server?')) return;
    if (!isTargeted && !confirm('Xác nhận lần 2?')) return;
    try {
      await api.post('/admin/system/incident/kill-switch', { pin: isTargeted ? killPin : undefined });
      setKillPin('');
    } catch (e: any) {
      alert('Lỗi: ' + e.response?.data?.message);
    }
  };

  const handleToggleLockdown = async () => {
    const next = !isLockdown;
    if (next && !confirm('Bật Hard Freeze? Màn hình người chơi sẽ bị khóa cứng.')) return;
    try {
      await api.post('/admin/system/incident/lockdown', { enable: next });
      setIsLockdown(next);
    } catch (e: any) {
      alert('Lỗi: ' + e.response?.data?.message);
    }
  };

  const handleUnban = async (ip: string) => {
    await api.post('/admin/system/incident/unban-ip', { ip });
    fetchBannedIps();
  };

  const handleManualBan = async () => {
    if (!manualBanIp.trim()) return;
    await api.post('/admin/system/incident/ban-ip', { ip: manualBanIp, reason: manualBanReason || 'Manual' });
    fetchBannedIps();
    setManualBanIp('');
    setManualBanReason('');
  };

  const fmtBytes = (b: number) => {
    if (!b) return '0';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ['B','KB','MB','GB'][i];
  };

  const eventColor = (type: string) => {
    if (type === 'CRITICAL') return 'text-red-500';
    if (type === 'WARNING' || type === 'WARN') return 'text-yellow-400';
    return 'text-gray-400';
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">System Operations</h1>
          <p className="text-sm text-gray-500">OPS Dashboard — metrics mỗi 3 giây</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-600">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'CPU (Node.js process)', value: metrics ? `${metrics.cpu.toFixed(2)}%` : '—' },
          { label: 'RAM (process)', value: metrics ? fmtBytes(metrics.memory) : '—' },
          { label: 'System RAM (free / total)', value: metrics ? `${fmtBytes(metrics.freeMem)} / ${fmtBytes(metrics.totalMem)}` : '—' },
        ].map((m) => (
          <div key={m.label} className="border rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">{m.label}</p>
            <p className="text-2xl font-mono font-semibold">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">

        {/* Event Log */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-medium">Event Log</span>
            <span className="text-xs text-gray-400">{events.length} entries</span>
          </div>
          <div ref={terminalRef} className="h-64 overflow-y-auto bg-gray-950 p-3 font-mono text-xs space-y-1">
            {events.length === 0 && <span className="text-gray-600">Chờ events...</span>}
            {events.map((ev, i) => (
              <div key={i}>
                <span className="text-gray-600">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                {' '}
                <span className={eventColor(ev.type)}>[{ev.type}]</span>
                {' '}
                <span className="text-gray-300">{ev.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Incident Controls */}
        <div className="border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-medium">Incident Controls</h2>

          {/* Kill Switch */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500">Kill Switch — nhập PIN để kill room cụ thể, để trống = Global</label>
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

          {/* Hard Freeze */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500">Hard Freeze — khóa màn hình toàn bộ người chơi</label>
            <button
              onClick={handleToggleLockdown}
              className={`w-full h-8 text-xs font-semibold rounded border transition-colors ${
                isLockdown
                  ? 'bg-yellow-100 border-yellow-400 text-yellow-800 hover:bg-yellow-200'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {isLockdown ? '🔒 Đang FREEZE — nhấn để tắt' : 'Bật Hard Freeze'}
            </button>
          </div>
        </div>
      </div>

      {/* IP Blacklist */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">IP Blacklist <span className="text-gray-400 font-normal">({bannedIps.length} banned)</span></h2>
          <button onClick={fetchBannedIps} className="text-xs text-gray-500 hover:text-gray-800 border rounded px-2 py-1">Refresh</button>
        </div>

        {/* Manual ban */}
        <div className="flex gap-2">
          <input
            value={manualBanIp}
            onChange={(e) => setManualBanIp(e.target.value)}
            placeholder="IP address"
            className="h-8 border rounded px-2 text-sm w-44"
          />
          <input
            value={manualBanReason}
            onChange={(e) => setManualBanReason(e.target.value)}
            placeholder="Lý do"
            className="flex-1 h-8 border rounded px-2 text-sm"
          />
          <button
            onClick={handleManualBan}
            disabled={!manualBanIp.trim()}
            className="h-8 px-3 text-xs font-semibold border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-40"
          >
            Ban
          </button>
        </div>

        {/* List */}
        <div className="max-h-48 overflow-y-auto divide-y text-sm">
          {bannedIps.length === 0 ? (
            <p className="text-gray-400 text-xs py-3 text-center">Chưa có IP nào bị ban.</p>
          ) : (
            bannedIps.map((b) => (
              <div key={b.ip} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-mono text-sm">{b.ip}</span>
                  <span className="text-xs text-gray-400 ml-3">{b.reason}</span>
                  <span className="text-xs text-gray-300 ml-2">{new Date(b.timestamp).toLocaleTimeString('vi-VN')}</span>
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

    </div>
  );
}
