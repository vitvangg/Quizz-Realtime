import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { SettingService } from '../../admin/system/setting/setting.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly settingService: SettingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isHttp = context.getType() === 'http';
    const isWs = context.getType() === 'ws';

    let ip = '127.0.0.1';

    if (isHttp) {
      const request = context.switchToHttp().getRequest();
      ip = request.ip || request.headers['x-forwarded-for']?.split(',')[0].trim() || request.connection.remoteAddress;
    } else if (isWs) {
      const client = context.switchToWs().getClient();
      const forwardedFor = client.handshake?.headers?.['x-forwarded-for'];
      const raw = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : client.handshake?.address;
      if (raw) ip = raw;
    }

    // Normalize IPv6 loopback
    if (ip === '::1' || ip === '::ffff:127.0.0.1') ip = '127.0.0.1';
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);

    // Bỏ qua rate limit cho admin dashboard fetch tĩnh nếu cần, nhưng tốt nhất là áp dụng chung
    // Lấy config từ DB (lấy getAll() vì nó được cache hoặc gọi nhanh)
    // Tốt hơn nên lấy trực tiếp từ Redis nếu có, nhưng SettingService đọc DB. 
    // Tạm thời lấy settings (Prisma có connection pool, nên khá nhanh, nhưng có thể tối ưu bằng caching)
    const settings = await this.settingService.getAll();
    const rateLimit = settings.rateLimitReqPerSec || 20;
    const banThreshold = settings.autoBanThreshold || 30;
    const autoBanEnabled = settings.autoBanEnabled ?? true;

    // Bỏ qua localhost/admin ip (nếu cần), ở đây áp dụng hết
    const { allowed, count } = await this.redisService.checkRateLimit(ip, rateLimit, 1000);

    // Auto ban trigger
    if (autoBanEnabled && count >= banThreshold) {
      // Đã vượt mốc ban threshold -> Trigger Auto ban event (1 lần)
      // Nếu đã ban rồi thì skip
      const isBanned = await this.redisService.isIpBanned(ip);
      if (!isBanned) {
        this.logger.warn(`[RateLimit] Auto-banning IP: ${ip} (Count: ${count}/${rateLimit})`);
        
        // Gọi hàm banIp của redis service
        const ttlHours = settings.defaultBanTtlHours || 24;
        await this.redisService.banIp(ip, `Auto-banned: Spam detected (${count} req/s)`, ttlHours * 3600);
        
        // Publish sự kiện ra cụm server để các gateway tự kick
        // Việc này sẽ được xử lý trong phần refactor DashboardService
        this.eventEmitter.emit('system.incident.auto_ban', {
          ip,
          reason: `Auto-banned: Exceeded ${banThreshold} req/s`,
          requestCount: count
        });
      }

      if (isHttp) {
        throw new HttpException('You have been banned for spamming.', HttpStatus.FORBIDDEN);
      } else {
        throw new WsException('You have been banned for spamming.');
      }
    }

    if (!allowed) {
      this.logger.warn(`[RateLimit] Throttled IP: ${ip} (Count: ${count}/${rateLimit})`);
      if (isHttp) {
        throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
      } else {
        throw new WsException('Too Many Requests');
      }
    }

    return true;
  }
}
