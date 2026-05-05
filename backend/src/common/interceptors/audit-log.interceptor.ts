import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    // Chỉ log các thay đổi dữ liệu (POST, PUT, PATCH, DELETE)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle().pipe(
        tap(async (data) => {
          try {
            // Lấy thông tin user từ request (thường được gán bởi AuthGuard)
            const userId = request.user?.id || null;
            
            // Phân tích URL để lấy tên Entity (VD: /admin/users -> Entity: users)
            const parts = url.split('/').filter(Boolean);
            const entity = parts.length > 1 ? parts[1] : 'unknown';
            
            // Nếu có data trả về và có id, đó là entityId. Nếu là DELETE, có thể id nằm ở param.
            const entityId = data?.id || request.params?.id || null;

            let action = 'UNKNOWN';
            if (method === 'POST') action = 'CREATE';
            if (method === 'PUT' || method === 'PATCH') action = 'UPDATE';
            if (method === 'DELETE') action = 'DELETE';

            // Ghi log vào DB
            await this.prisma.auditLog.create({
              data: {
                action,
                entity,
                entityId,
                userId,
                details: JSON.stringify({
                  body: request.body,
                  // Có thể log thêm response data nếu cần
                }),
                ipAddress: request.ip,
              },
            });
          } catch (error) {
            console.error('Failed to write audit log', error);
          }
        }),
      );
    }

    return next.handle();
  }
}
