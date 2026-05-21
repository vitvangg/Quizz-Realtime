import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface SystemSettings {
  rateLimitReqPerSec: number;
  autoBanThreshold: number;
  autoBanEnabled: boolean;
  defaultBanTtlHours: number;
  emailAlertsEnabled: boolean;
  maxPlayersPerRoom: number;
  maxRoomsPerHost: number;
}

// Default values nếu chưa có trong DB
const DEFAULTS: SystemSettings = {
  rateLimitReqPerSec: 20,
  autoBanThreshold: 30,
  autoBanEnabled: true,
  defaultBanTtlHours: 24,
  emailAlertsEnabled: true,
  maxPlayersPerRoom: 100,
  maxRoomsPerHost: 3,
};

@Injectable()
export class SettingService {
  private readonly logger = new Logger(SettingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<SystemSettings> {
    const rows = await this.prisma.setting.findMany();
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }

    return {
      rateLimitReqPerSec: map['rateLimitReqPerSec'] ? Number(map['rateLimitReqPerSec']) : DEFAULTS.rateLimitReqPerSec,
      autoBanThreshold: map['autoBanThreshold'] ? Number(map['autoBanThreshold']) : DEFAULTS.autoBanThreshold,
      autoBanEnabled: map['autoBanEnabled'] !== undefined ? map['autoBanEnabled'] === 'true' : DEFAULTS.autoBanEnabled,
      defaultBanTtlHours: map['defaultBanTtlHours'] ? Number(map['defaultBanTtlHours']) : DEFAULTS.defaultBanTtlHours,
      emailAlertsEnabled: map['emailAlertsEnabled'] !== undefined ? map['emailAlertsEnabled'] === 'true' : DEFAULTS.emailAlertsEnabled,
      maxPlayersPerRoom: map['maxPlayersPerRoom'] ? Number(map['maxPlayersPerRoom']) : DEFAULTS.maxPlayersPerRoom,
      maxRoomsPerHost: map['maxRoomsPerHost'] ? Number(map['maxRoomsPerHost']) : DEFAULTS.maxRoomsPerHost,
    };
  }

  async updateAll(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    const updates = Object.entries(settings).map(([key, value]) =>
      this.prisma.setting.upsert({
        where: { key },
        create: { key, value: String(value), description: key },
        update: { value: String(value) },
      })
    );

    await Promise.all(updates);
    this.logger.log(`[Settings] Updated: ${JSON.stringify(settings)}`);
    return this.getAll();
  }

  // Đọc 1 setting cụ thể (dùng từ các service khác)
  async get(key: keyof SystemSettings): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row?.value ?? null;
  }
}
