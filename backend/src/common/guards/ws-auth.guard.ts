import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      throw new WsException('Unauthorized: No token provided');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_KEY,
      });
      client.data.user = payload;
      return true;
    } catch (error) {
      throw new WsException('Unauthorized: Invalid token');
    }
  }

  private extractToken(client: Socket): string | undefined {
    const token = client.handshake.auth?.token;
    if (token) return token;

    const authHeader = client.handshake.headers?.authorization;
    if (authHeader) {
      const [type, tokenValue] = authHeader.split(' ');
      return type === 'Bearer' ? tokenValue : undefined;
    }

    return undefined;
  }
}
