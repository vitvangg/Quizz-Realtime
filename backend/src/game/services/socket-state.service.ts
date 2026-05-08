import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';

export interface SocketInfo {
  socketId: string;
  roomId: string;
  playerId?: string;
  sessionId?: string;  // Game session ID
  isHost: boolean;
  userId?: string;
}

@Injectable()
export class SocketStateService {
  private readonly logger = new Logger(SocketStateService.name);

  private socketInfoMap = new Map<string, SocketInfo>();
  private playerSocketMap = new Map<string, string>();
  private roomHostMap = new Map<string, string>();

  // ============================================================================
  // REGISTRATION
  // ============================================================================

  registerHost(socketId: string, roomId: string, userId: string): void {
    const info: SocketInfo = {
      socketId,
      roomId,
      isHost: true,
      userId,
    };
    this.socketInfoMap.set(socketId, info);
    this.roomHostMap.set(roomId, socketId);
    this.logger.debug(`Host registered: socketId=${socketId}, roomId=${roomId}`);
  }

  registerPlayer(socketId: string, roomId: string, playerId: string, sessionId?: string): void {
    const info: SocketInfo = {
      socketId,
      roomId,
      playerId,
      sessionId,
      isHost: false,
    };
    this.socketInfoMap.set(socketId, info);
    this.playerSocketMap.set(playerId, socketId);
    this.logger.debug(`Player registered: socketId=${socketId}, playerId=${playerId}, roomId=${roomId}, sessionId=${sessionId}`);
  }

  updatePlayerSession(socketId: string, sessionId: string): void {
    const info = this.socketInfoMap.get(socketId);
    if (info) {
      info.sessionId = sessionId;
      this.socketInfoMap.set(socketId, info);
    }
  }

  unregisterSocket(socketId: string): SocketInfo | undefined {
    const info = this.socketInfoMap.get(socketId);
    if (!info) return undefined;

    if (info.playerId) {
      this.playerSocketMap.delete(info.playerId);
    }
    if (info.isHost) {
      this.roomHostMap.delete(info.roomId);
    }
    this.socketInfoMap.delete(socketId);
    return info;
  }

  unregisterPlayer(playerId: string): string | undefined {
    const socketId = this.playerSocketMap.get(playerId);
    if (socketId) {
      this.playerSocketMap.delete(playerId);
      const info = this.socketInfoMap.get(socketId);
      if (info) {
        this.socketInfoMap.delete(socketId);
      }
    }
    return socketId;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  getSocketInfo(socketId: string): SocketInfo | undefined {
    return this.socketInfoMap.get(socketId);
  }

  getPlayerSocketId(playerId: string): string | undefined {
    return this.playerSocketMap.get(playerId);
  }

  getHostSocketId(roomId: string): string | undefined {
    return this.roomHostMap.get(roomId);
  }

  getPlayersInRoom(roomId: string): Array<{ playerId: string; socketId: string }> {
    const players: Array<{ playerId: string; socketId: string }> = [];
    for (const [playerId, socketId] of this.playerSocketMap.entries()) {
      const info = this.socketInfoMap.get(socketId);
      if (info?.roomId === roomId) {
        players.push({ playerId, socketId });
      }
    }
    return players;
  }

  getSocketsInRoom(roomId: string): string[] {
    const socketIds: string[] = [];
    for (const [socketId, info] of this.socketInfoMap.entries()) {
      if (info.roomId === roomId) {
        socketIds.push(socketId);
      }
    }
    return socketIds;
  }

  isHost(socketId: string): boolean {
    const info = this.socketInfoMap.get(socketId);
    return info?.isHost ?? false;
  }

  verifyHost(socketId: string): SocketInfo | null {
    const info = this.socketInfoMap.get(socketId);
    if (!info || !info.isHost) return null;
    return info;
  }

  verifyPlayer(socketId: string): SocketInfo | null {
    const info = this.socketInfoMap.get(socketId);
    if (!info || info.isHost) return null;
    return info;
  }
}
