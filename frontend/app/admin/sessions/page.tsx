'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';
import { Wifi, WifiOff, AlertTriangle, Zap, Users, Clock, Shield } from 'lucide-react';

interface ActiveSession {
  sessionId: string;
  roomId: string;
  hostId: string;
  status: string;
  playersCount: number;
  startedAt: number;
}

interface PlayerPresence {
  playerId: string;
  nickname: string;
  isHost: boolean;
  connection: string;
  ipAddress?: string;
  lastSeen: number;
  joinedAt: number;
  requestCount?: number;
}

export default function GameSessionsPage() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<PlayerPresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [killingSessionId, setKillingSessionId] = useState<string | null>(null);
  const [banningIp, setBanningIp] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const { accessToken, isHydrated } = useAuthStore();

  // WebSocket OPS
  useEffect(() => {
    if (!isHydrated || !accessToken) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';

    socketRef.current = io(`${wsUrl}/admin-ops`, {
      transports: ['websocket'],
      auth: { token: accessToken }
    });

    socketRef.current.on('connect', () => setIsConnected(true));
    socketRef.current.on('disconnect', () => setIsConnected(false));

    socketRef.current.on('admin:rooms_update', (data: { sessions: ActiveSession[], timestamp: string }) => {
      setSessions(data.sessions || []);
    });

    return () => { socketRef.current?.disconnect(); };
  }, [isHydrated, accessToken]);

  const fetchSessionPlayers = useCallback(async (sessionId: string) => {
    setIsLoadingPlayers(true);
    try {
      const res = await api.get(`/admin/system/incident/sessions/${sessionId}/players`);
      setSessionPlayers(res.data.players || []);
    } catch (e) {
      console.error('Failed to fetch players', e);
    } finally {
      setIsLoadingPlayers(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionPlayers(selectedSessionId);
      const t = setInterval(() => fetchSessionPlayers(selectedSessionId), 5000);
      return () => clearInterval(t);
    }
  }, [selectedSessionId, fetchSessionPlayers]);

  const handleKillSession = async (sessionId: string) => {
    if (!confirm(`Xác nhận KILL phòng ${sessionId.slice(0, 8)}...?\n\nTất cả người chơi sẽ bị ngắt kết nối ngay lập tức.`)) return;
    setKillingSessionId(sessionId);
    try {
      await api.post('/admin/system/incident/kill-switch', { pin: sessionId });
      // Xóa khỏi danh sách local ngay sau khi kill thành công
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setSessionPlayers([]);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.response?.data?.message);
    } finally {
      setKillingSessionId(null);
    }
  };

  const handleBanIp = async (ip: string, nickname: string) => {
    if (!ip) {
      alert('Không tìm thấy IP của người dùng này.');
      return;
    }
    if (!confirm(`BAN IP ${ip} của "${nickname}" trong 24h?\n\nHọ sẽ bị kick ngay lập tức và không thể reconnect.`)) return;
    setBanningIp(ip);
    try {
      await api.post('/admin/system/incident/ban-ip', {
        ip,
        reason: `Ban người chơi ${nickname} từ Game Sessions`,
        ttlHours: 24,
      });
      // Cập nhật trạng thái player trong list
      setSessionPlayers(prev =>
        prev.map(p => p.ipAddress === ip ? { ...p, connection: 'DISCONNECTED' } : p)
      );
      alert(`✅ Đã BAN IP ${ip}. Người chơi sẽ bị kick ngay lập tức.`);
    } catch (e: any) {
      alert('Lỗi: ' + e.response?.data?.message);
    } finally {
      setBanningIp(null);
    }
  };

  const formatTime = (ms: number) => {
    if (!ms) return 'N/A';
    return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (startMs: number) => {
    if (!startMs) return 'N/A';
    const diff = Date.now() - startMs;
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m}m ${s}s`;
  };

  const getReqBadge = (count?: number) => {
    if (count === undefined || count === null) return null;
    if (count > 15) return { label: `${count} req/s`, cls: 'bg-red-100 text-red-700 border-red-200', icon: '⚠️' };
    if (count > 8) return { label: `${count} req/s`, cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: '⚡' };
    return { label: `${count} req/s`, cls: 'bg-gray-100 text-gray-500 border-gray-200', icon: '' };
  };

  const totalPlayers = sessions.reduce((sum, s) => sum + s.playersCount, 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-black pb-4">
        <div>
          <h1 className="text-2xl font-black text-black">Game Sessions Tracker</h1>
          <p className="text-xs text-gray-500 mt-0.5">Giám sát phòng game trực tiếp, CCU, IP và request rate</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex gap-3 text-xs">
            <div className="flex items-center gap-1.5 border-2 border-black rounded-lg px-3 py-1.5 bg-neon-green">
              <Zap className="h-3.5 w-3.5" />
              <span className="font-black">{sessions.length} phòng</span>
            </div>
            <div className="flex items-center gap-1.5 border-2 border-black rounded-lg px-3 py-1.5 bg-neon-blue">
              <Users className="h-3.5 w-3.5" />
              <span className="font-black">{totalPlayers} CCU</span>
            </div>
          </div>
          {/* Connection status */}
          <div className={`flex items-center gap-1.5 text-xs border-2 border-black rounded-lg px-3 py-1.5 ${isConnected ? 'bg-green-50' : 'bg-red-50'}`}>
            {isConnected
              ? <><Wifi className="h-3.5 w-3.5 text-green-600" /><span className="font-bold text-green-700">LIVE</span></>
              : <><WifiOff className="h-3.5 w-3.5 text-red-500" /><span className="font-bold text-red-600">OFFLINE</span></>
            }
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Danh sách Session */}
        <div className="md:col-span-2 border-4 border-black rounded-xl overflow-hidden bg-white shadow-brutal flex flex-col h-[600px]">
          <div className="px-4 py-3 border-b-4 border-black bg-neon-yellow flex justify-between items-center shrink-0">
            <span className="text-sm font-black text-black">ACTIVE ROOMS ({sessions.length})</span>
            <span className="text-xs text-gray-600 font-mono">{isConnected ? '🟢 Real-time' : '⚫ Disconnected'}</span>
          </div>

          <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Zap className="h-8 w-8 opacity-30" />
                <p className="text-sm font-medium">Không có phòng game nào đang diễn ra</p>
                {!isConnected && <p className="text-xs text-red-400">⚠ WebSocket mất kết nối</p>}
              </div>
            ) : (
              sessions.map(s => (
                <div
                  key={s.sessionId}
                  className={`border-2 rounded-xl p-3.5 transition-all cursor-pointer ${selectedSessionId === s.sessionId
                    ? 'border-black bg-neon-blue/20 shadow-brutal-sm'
                    : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  onClick={() => setSelectedSessionId(s.sessionId)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-gray-800">{s.sessionId.slice(0, 10)}…</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-black uppercase border ${s.status === 'PLAYING' || s.status === 'QUESTION_ACTIVE'
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                          {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Host: <span className="font-mono">{s.hostId.slice(0, 8)}…</span></p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-sm font-black text-black bg-neon-blue border-2 border-black px-2 py-0.5 rounded-full">
                        👥 {s.playersCount}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleKillSession(s.sessionId); }}
                        disabled={killingSessionId === s.sessionId}
                        className="text-[10px] uppercase font-black text-red-600 hover:bg-red-50 border border-red-300 rounded px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        {killingSessionId === s.sessionId ? 'Killing…' : '⚡ Kill Room'}
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-400 flex justify-between">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDuration(s.startedAt)} ago</span>
                    <span>Bắt đầu: {formatTime(s.startedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chi tiết Player */}
        <div className="border-4 border-black rounded-xl overflow-hidden bg-white shadow-brutal flex flex-col h-[600px]">
          <div className="px-4 py-3 border-b-4 border-black bg-neon-pink shrink-0">
            <div className="flex justify-between items-center">
              <span className="text-sm font-black text-black">PLAYERS IN ROOM</span>
              {isLoadingPlayers && <span className="text-xs text-gray-500 animate-pulse">Đang tải...</span>}
            </div>
            {selectedSessionId && (
              <p className="text-[10px] font-mono text-gray-600 mt-0.5 truncate">{selectedSessionId}</p>
            )}
          </div>

          <div className="overflow-y-auto flex-1 p-0">
            {!selectedSessionId ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Users className="h-8 w-8 opacity-30" />
                <p className="text-sm font-medium">Chọn một phòng để xem chi tiết</p>
              </div>
            ) : sessionPlayers.length === 0 && !isLoadingPlayers ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Không có dữ liệu người chơi
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {sessionPlayers.map((p, idx) => {
                  const reqBadge = getReqBadge(p.requestCount);
                  return (
                    <li key={idx} className="p-3 hover:bg-gray-50 group">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1 overflow-hidden flex-1">
                          {/* Name + badges */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-gray-800 truncate" title={p.nickname}>
                              {p.nickname}
                            </span>
                            {p.isHost && (
                              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded border border-yellow-300 uppercase font-black">
                                Host
                              </span>
                            )}
                            {/* Request rate badge */}
                            {reqBadge && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${reqBadge.cls}`} title="Số request trong 1 giây gần nhất">
                                {reqBadge.icon} {reqBadge.label}
                              </span>
                            )}
                          </div>

                          {/* Connection + IP */}
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.connection === 'CONNECTED' ? 'bg-green-500' : 'bg-red-400'}`} />
                            <span className={`font-medium text-[10px] ${p.connection === 'CONNECTED' ? 'text-green-600' : 'text-red-500'}`}>
                              {p.connection}
                            </span>
                            <span className="font-mono text-[10px]" title={p.ipAddress || 'Unknown IP'}>
                              {p.ipAddress || 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* Ban button */}
                        {!p.isHost && (
                          <button
                            onClick={() => handleBanIp(p.ipAddress || '', p.nickname)}
                            disabled={!p.ipAddress || banningIp === p.ipAddress}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] border border-red-300 text-red-600 hover:bg-red-50 rounded px-2 py-1 transition-all disabled:opacity-30 shrink-0 ml-2 font-bold"
                            title="Ban IP này trong 24h — kick ngay lập tức"
                          >
                            <Shield className="h-3 w-3" />
                            {banningIp === p.ipAddress ? '…' : 'Ban IP'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer legend */}
          {sessionPlayers.length > 0 && (
            <div className="border-t-2 border-gray-100 px-3 py-2 bg-gray-50 shrink-0">
              <div className="flex items-center gap-3 text-[10px] text-gray-400">
                <span>⚠️ req/s &gt;15 = đáng ngờ</span>
                <span>⚡ req/s &gt;8 = theo dõi</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
