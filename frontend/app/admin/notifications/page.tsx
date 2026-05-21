'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/axios';
import { Bell, Mail, AlertTriangle, Info, CheckCircle, RefreshCw } from 'lucide-react';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  targetType: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'config'>('history');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/system/notifications/history?limit=50');
      setNotifications(res.data.notifications || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const isAutoban = (n: NotificationItem) =>
    n.title?.toLowerCase().includes('auto') || n.title?.toLowerCase().includes('ban');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b-4 border-black pb-5">
        <h1 className="text-3xl font-black tracking-tight text-black">Notification Center</h1>
        <p className="mt-1 text-sm text-gray-500">
          Lịch sử thông báo bảo mật đã gửi và cấu hình kênh thông báo
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b-4 border-black">
        {[
          { key: 'history', label: '📋 Lịch sử' },
          { key: 'config', label: '⚙️ Cấu hình' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-5 py-2.5 text-sm font-black border-4 rounded-t-lg border-b-0 -mb-1 transition-colors ${
              activeTab === tab.key
                ? 'bg-black text-white border-black'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {notifications.length} thông báo
              {lastUpdated && <span className="ml-2 text-xs text-gray-400">— {lastUpdated.toLocaleTimeString('vi-VN')}</span>}
            </p>
            <button
              onClick={fetchHistory}
              className="flex items-center gap-1.5 rounded-lg border-4 border-black bg-neon-blue px-3 py-2 text-xs font-black shadow-brutal-sm hover:bg-neon-pink transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {/* Notice */}
          <div className="flex items-start gap-3 rounded-xl border-4 border-black bg-neon-blue p-4">
            <Info className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">
              Thông báo được tạo tự động khi hệ thống phát hiện tấn công (auto-ban IP) và gửi email cảnh báo cho admin.
            </p>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Đang tải...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">Chưa có thông báo nào</p>
              <p className="text-xs text-gray-300">Thông báo sẽ xuất hiện khi có auto-ban xảy ra</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`rounded-xl border-4 border-black bg-white shadow-brutal-sm p-4 ${
                    !n.isRead ? 'border-l-8 border-l-red-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded border font-black ${
                        isAutoban(n)
                          ? 'bg-red-100 text-red-700 border-red-300'
                          : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                      }`}>
                        🚨 {isAutoban(n) ? 'AUTO-BAN' : 'SECURITY ALERT'}
                      </span>
                      <span className="text-[11px] text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Đã lưu
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 font-mono shrink-0 ml-2">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-black text-black mb-2">{n.title}</p>
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 font-mono whitespace-pre-wrap border border-gray-200 overflow-auto max-h-40">
                    {n.message}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="space-y-4 max-w-lg">
          <div className="rounded-xl border-4 border-black shadow-brutal overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-neon-yellow border-b-4 border-black">
              <Mail className="h-5 w-5" />
              <h2 className="font-black">Cấu hình Email SMTP</h2>
            </div>
            <div className="bg-white p-5 space-y-3">
              <p className="text-sm text-gray-600">
                Cấu hình trong file <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-sm">.env</code> của backend:
              </p>
              <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs text-green-400 space-y-1">
                <p>SMTP_HOST=smtp.gmail.com</p>
                <p>SMTP_PORT=465</p>
                <p>SMTP_SECURE=true</p>
                <p>SMTP_USERNAME=your@email.com</p>
                <p>SMTP_PASSWORD=your-app-password</p>
                <p>SMTP_FROMEMAIL=your@email.com</p>
                <p>SMTP_FROMNAME=Quizz Security</p>
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Với Gmail: sử dụng App Password. Bật 2FA và tạo App Password tại{' '}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-bold">
                    Google Account
                  </a>.
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border-4 border-black shadow-brutal overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-neon-blue border-b-4 border-black">
              <Bell className="h-5 w-5" />
              <h2 className="font-black">Khi nào email được gửi?</h2>
            </div>
            <div className="bg-white p-5">
              <ul className="space-y-2 text-sm">
                {[
                  { trigger: 'Auto-ban IP', desc: 'Khi hệ thống phát hiện IP vượt ngưỡng request/s', active: true },
                  { trigger: 'Kill Switch Global', desc: 'Khi admin kích hoạt ngắt toàn bộ server', active: false },
                  { trigger: 'CPU Alert', desc: 'Khi CPU backend vượt 80%', active: false },
                ].map(item => (
                  <li key={item.trigger} className="flex gap-3 items-start">
                    <span className={`mt-0.5 text-xs font-black px-1.5 py-0.5 rounded border shrink-0 ${
                      item.active
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : 'bg-gray-100 text-gray-400 border-gray-200'
                    }`}>
                      {item.active ? 'ACTIVE' : 'TODO'}
                    </span>
                    <div>
                      <span className="font-bold">{item.trigger}:</span>
                      <span className="text-gray-500 ml-1">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
