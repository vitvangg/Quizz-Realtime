'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';

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
}

export default function GameSessionsPage() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<PlayerPresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
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

    socketRef.current.on('connect', () => {
      setIsConnected(true);
    });
    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });
    
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
    if (!confirm(`Xác nhận đóng băng và giải tán phòng ${sessionId.slice(0, 8)}...?`)) return;
    try {
      await api.post('/admin/system/incident/kill-switch', { pin: sessionId });
    } catch (e: any) { alert('Lỗi: ' + e.response?.data?.message); }
  };

  const handleBanIp = async (ip: string, nickname: string) => {
    if (!ip) {
      alert("Không tìm thấy IP của người dùng này.");
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn BAN IP ${ip} của người chơi "${nickname}" trong 24h?`)) return;
    try {
      await api.post('/admin/system/incident/ban-ip', {
        ip,
        reason: `Ban người chơi ${nickname} từ Game Sessions`,
        ttlHours: 24,
      });
      alert(`Đã BAN IP ${ip} thành công.`);
    } catch (e: any) { alert('Lỗi: ' + e.response?.data?.message); }
  };

  const formatTime = (ms: number) => {
    if (!ms) return 'N/A';
    return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">Game Sessions Tracker</h1>
          <p className="text-xs text-gray-500">Giám sát các phiên game trực tuyến, CCU và quản lý kết nối</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs text-gray-500`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Bảng Danh sách Session */}
        <div className="md:col-span-2 border rounded-lg overflow-hidden bg-white shadow-sm flex flex-col h-[600px]">
          <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center shrink-0">
            <span className="text-sm font-semibold text-gray-700">Active Rooms ({sessions.length})</span>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {sessions.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">Không có phiên game nào đang diễn ra.</p>
            ) : (
              sessions.map(s => (
                <div 
                  key={s.sessionId} 
                  className={`border rounded-lg p-3 transition-colors cursor-pointer ${selectedSessionId === s.sessionId ? 'border-blue-400 bg-blue-50/30' : 'hover:border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => setSelectedSessionId(s.sessionId)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-gray-800">{s.sessionId.slice(0, 10)}...</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                          s.status === 'PLAYING' || s.status === 'QUESTION_ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Host ID: <span className="font-mono">{s.hostId}</span></p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        👥 {s.playersCount} players
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleKillSession(s.sessionId); }}
                        className="text-[10px] uppercase font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-2 py-1 transition-colors"
                      >
                        Kill Room
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-400 flex justify-between">
                    <span>Started: {formatTime(s.startedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bảng Chi tiết Player */}
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm flex flex-col h-[600px]">
          <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center shrink-0">
            <span className="text-sm font-semibold text-gray-700">Players in Room</span>
            {isLoadingPlayers && <span className="text-xs text-gray-400">Loading...</span>}
          </div>
          
          <div className="overflow-y-auto flex-1 p-0">
            {!selectedSessionId ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Chọn một phòng để xem chi tiết
              </div>
            ) : sessionPlayers.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Không có dữ liệu người chơi
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {sessionPlayers.map((p, idx) => (
                  <li key={idx} className="p-3 hover:bg-gray-50 flex justify-between items-center group">
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-800 truncate" title={p.nickname}>
                          {p.nickname}
                        </span>
                        {p.isHost && (
                          <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded uppercase font-semibold">
                            Host
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className={`w-1.5 h-1.5 rounded-full ${p.connection === 'CONNECTED' ? 'bg-green-500' : 'bg-red-400'}`} />
                        <span className="font-mono" title={p.ipAddress || 'Unknown IP'}>{p.ipAddress || 'N/A'}</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleBanIp(p.ipAddress || '', p.nickname)}
                      disabled={!p.ipAddress}
                      className="opacity-0 group-hover:opacity-100 text-[10px] border border-red-200 text-red-600 hover:bg-red-50 rounded px-2 py-1 transition-all disabled:opacity-0"
                      title="Ban IP này trong 24h"
                    >
                      Ban IP
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
