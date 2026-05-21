'use client';

import { useState, useEffect, useCallback } from 'react';
import { Gauge, Shield, Mail, Database, Save, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import api from '@/lib/axios';

interface SystemSettings {
  rateLimitReqPerSec: number;
  autoBanThreshold: number;
  autoBanEnabled: boolean;
  defaultBanTtlHours: number;
  emailAlertsEnabled: boolean;
  maxPlayersPerRoom: number;
  maxRoomsPerHost: number;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full border-2 border-black transition-colors ${value ? 'bg-neon-green' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-black border border-black transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function InputRow({ label, sub, value, onChange, type = 'text', unit = '' }: {
  label: string; sub?: string; value: string | number;
  onChange: (v: string) => void; type?: string; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-bold text-black">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-24 h-8 border-2 border-black rounded-lg text-sm px-2 text-right font-mono focus:outline-none focus:ring-2 focus:ring-black"
        />
        {unit && <span className="text-xs text-gray-500 w-10">{unit}</span>}
      </div>
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-bold text-black">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

const DEFAULTS: SystemSettings = {
  rateLimitReqPerSec: 20,
  autoBanThreshold: 30,
  autoBanEnabled: true,
  defaultBanTtlHours: 24,
  emailAlertsEnabled: true,
  maxPlayersPerRoom: 100,
  maxRoomsPerHost: 3,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/system/settings');
      setSettings(res.data);
      setError(null);
    } catch (e: any) {
      setError('Không thể tải cấu hình: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await api.patch('/admin/system/settings', settings);
      setSettings(res.data);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e: any) {
      setSaveStatus('error');
      setError('Lỗi lưu: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof SystemSettings) => (value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Đang tải cấu hình...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-black pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-black">Cấu hình hệ thống</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cài đặt được lưu vào database, có hiệu lực ngay sau khi lưu
          </p>
        </div>
        <button
          onClick={fetchSettings}
          className="flex items-center gap-1.5 rounded-lg border-4 border-black bg-neon-blue px-3 py-2 text-xs font-black shadow-brutal-sm hover:bg-neon-pink transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border-4 border-red-500 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      {/* Notice */}
      <div className="flex items-start gap-3 rounded-xl border-4 border-black bg-neon-yellow p-4">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-black">Lưu ý</p>
          <p className="text-xs text-gray-700 mt-0.5">
            Thay đổi rateLimitReqPerSec và autoBanThreshold sẽ có hiệu lực cho các kết nối mới.
            Các kết nối hiện tại cần reconnect để áp dụng rate limit mới.
          </p>
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="rounded-xl border-4 border-black shadow-brutal overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-neon-yellow border-b-4 border-black">
          <Gauge className="h-5 w-5" />
          <div>
            <h2 className="font-black">Rate Limiting</h2>
            <p className="text-xs text-gray-600">Cấu hình auto-ban và giới hạn request</p>
          </div>
        </div>
        <div className="bg-white px-5">
          <InputRow
            label="Giới hạn request/giây"
            sub="Mỗi IP được phép gửi tối đa N request/s qua WebSocket"
            value={settings.rateLimitReqPerSec}
            onChange={v => update('rateLimitReqPerSec')(Number(v))}
            type="number"
            unit="req/s"
          />
          <InputRow
            label="Ngưỡng auto-ban"
            sub="Khi vượt ngưỡng này, IP sẽ bị tự động ban ngay lập tức"
            value={settings.autoBanThreshold}
            onChange={v => update('autoBanThreshold')(Number(v))}
            type="number"
            unit="req/s"
          />
          <ToggleRow
            label="Auto-ban tự động"
            sub="Tự động ban IP khi phát hiện tấn công và gửi email cảnh báo"
            value={settings.autoBanEnabled}
            onChange={update('autoBanEnabled')}
          />
        </div>
      </div>

      {/* IP Blacklist */}
      <div className="rounded-xl border-4 border-black shadow-brutal overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-neon-pink border-b-4 border-black">
          <Shield className="h-5 w-5" />
          <div>
            <h2 className="font-black">IP Blacklist</h2>
            <p className="text-xs text-gray-600">TTL mặc định khi ban IP</p>
          </div>
        </div>
        <div className="bg-white px-5">
          <InputRow
            label="TTL ban mặc định"
            sub="Thời gian mặc định khi admin ban thủ công qua dashboard"
            value={settings.defaultBanTtlHours}
            onChange={v => update('defaultBanTtlHours')(Number(v))}
            type="number"
            unit="giờ"
          />
        </div>
      </div>

      {/* Email Alerts */}
      <div className="rounded-xl border-4 border-black shadow-brutal overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-neon-blue border-b-4 border-black">
          <Mail className="h-5 w-5" />
          <div>
            <h2 className="font-black">Email Alerts</h2>
            <p className="text-xs text-gray-600">Thông báo bảo mật qua SMTP</p>
          </div>
        </div>
        <div className="bg-white px-5">
          <ToggleRow
            label="Gửi email cảnh báo"
            sub="Email được gửi khi có auto-ban hoặc sự kiện bảo mật nghiêm trọng"
            value={settings.emailAlertsEnabled}
            onChange={update('emailAlertsEnabled')}
          />
          <div className="py-3">
            <p className="text-xs text-gray-500">
              Cấu hình SMTP trong file <code className="font-mono bg-gray-100 px-1 rounded">.env</code>:
              SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROMEMAIL
            </p>
          </div>
        </div>
      </div>

      {/* Game Settings */}
      <div className="rounded-xl border-4 border-black shadow-brutal overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-neon-green border-b-4 border-black">
          <Database className="h-5 w-5" />
          <div>
            <h2 className="font-black">Game Settings</h2>
            <p className="text-xs text-gray-600">Giới hạn phòng, người chơi</p>
          </div>
        </div>
        <div className="bg-white px-5">
          <InputRow
            label="Số người chơi tối đa / phòng"
            sub="Giới hạn CCU trong một game session"
            value={settings.maxPlayersPerRoom}
            onChange={v => update('maxPlayersPerRoom')(Number(v))}
            type="number"
            unit="người"
          />
          <InputRow
            label="Số phòng tối đa / host"
            sub="Một user có thể tạo tối đa N phòng cùng lúc"
            value={settings.maxRoomsPerHost}
            onChange={v => update('maxRoomsPerHost')(Number(v))}
            type="number"
            unit="phòng"
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end items-center gap-4">
        {saveStatus === 'success' && (
          <span className="flex items-center gap-1.5 text-sm text-green-700 font-bold">
            <CheckCircle className="h-4 w-4" /> Đã lưu thành công vào DB
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-sm text-red-600 font-bold">❌ Lưu thất bại</span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 rounded-xl border-4 border-black px-6 py-3 font-black text-sm shadow-brutal transition-colors disabled:opacity-60 ${
            saveStatus === 'success'
              ? 'bg-neon-green'
              : 'bg-black text-white hover:bg-gray-800'
          }`}
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Đang lưu…' : saveStatus === 'success' ? '✅ Đã lưu!' : 'Lưu cấu hình'}
        </button>
      </div>
    </div>
  );
}
