'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Activity, Cpu, HardDrive, Terminal } from 'lucide-react';

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

export default function SystemDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Kết nối tới namespace /admin-ops
    // Lưu ý: Ở môi trường thực tế cần truyền jwt token để qua được Guard
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
    socketRef.current = io(`${wsUrl}/admin-ops`, {
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      setEvents(prev => [...prev, {
        type: 'INFO',
        message: 'Connected to System OPS Gateway',
        timestamp: new Date()
      }]);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      setEvents(prev => [...prev, {
        type: 'WARNING',
        message: 'Disconnected from System OPS Gateway',
        timestamp: new Date()
      }]);
    });

    socketRef.current.on('system:metrics', (data: SystemMetrics) => {
      setMetrics(data);
    });

    socketRef.current.on('system:event', (event: SystemEvent) => {
      setEvents(prev => [...prev, event]);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [events]);

  const handleKillSwitch = async () => {
    if (!confirm('NGUY HIỂM: Bạn có chắc chắn muốn ngắt kết nối TOÀN BỘ người chơi?')) return;

    try {
      // Gọi API Kill Switch thông qua axios instance đã setup JWT
      await api.post('/admin/system/incident/kill-switch');
      alert('Đã kích hoạt Kill Switch!');
    } catch (error: any) {
      console.error(error);
      const serverMessage = error.response?.data?.message || 'Có thể do lỗi JWT/CORS hoặc bạn không có quyền SUPER_ADMIN.';
      alert(`Không thể kích hoạt Kill Switch: ${serverMessage}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Operations (OPS)</h1>
          <p className="text-muted-foreground">
            Monitor real-time system metrics and manage incidents.
          </p>
        </div>
        <Badge variant={isConnected ? 'default' : 'destructive'} className="text-sm">
          {isConnected ? 'LIVE' : 'OFFLINE'}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Node.js CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? metrics.cpu.toFixed(2) : '--'}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Process Memory</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? formatBytes(metrics.memory) : '--'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System RAM (Free/Total)</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {metrics ? `${formatBytes(metrics.freeMem)} / ${formatBytes(metrics.totalMem)}` : '--'}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1 bg-black text-green-400 border-border">
          <CardHeader className="border-b border-gray-800">
            <CardTitle className="flex items-center space-x-2 text-gray-300">
              <Terminal className="h-5 w-5" />
              <span>Event Stream</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              ref={terminalRef}
              className="h-[300px] overflow-y-auto p-4 font-mono text-sm"
            >
              {events.map((ev, i) => (
                <div key={i} className="mb-2">
                  <span className="text-gray-500">[{new Date(ev.timestamp).toLocaleTimeString()}]</span>{' '}
                  <span className={ev.type === 'CRITICAL' ? 'text-red-500 font-bold' : ev.type === 'WARNING' ? 'text-yellow-500' : 'text-blue-400'}>
                    [{ev.type}]
                  </span>{' '}
                  {ev.message}
                </div>
              ))}
              {events.length === 0 && <div className="text-gray-600">Waiting for events...</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-900 bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Incident Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border border-red-900 rounded-lg bg-red-950/40">
              <h3 className="font-bold text-red-500 mb-2">Kill Switch</h3>
              <p className="text-sm text-red-300 mb-4">
                Ngắt kết nối toàn bộ người chơi đang hoạt động trên hệ thống ngay lập tức. Hành động này không thể hoàn tác.
              </p>
              <Button variant="destructive" onClick={handleKillSwitch} className="w-full font-bold">
                ACTIVATE KILL SWITCH
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
