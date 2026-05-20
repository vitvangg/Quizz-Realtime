/**
 * Socket Event Normalizer
 * 
 * Provides utility functions to normalize player events across different gateways.
 * This ensures consistent payload format regardless of which gateway emitted the event.
 */

import {
  PlayerJoinedEvent,
  PlayerLeftEvent,
} from './socket-events.interface';

/**
 * Normalizes player_joined payload from either RoomGateway or GameGateway format
 * to the unified PlayerJoinedEvent format.
 */
export function normalizePlayerJoinedEvent(data: any): PlayerJoinedEvent | null {
  if (!data) return null;

  // Handle RoomGateway format: { player: { id, nickname }, playerCount, joinedBy }
  if (data.player && data.player.id) {
    return {
      playerId: data.player.id,
      nickname: data.player.nickname,
      playerCount: data.playerCount,
      joinedBy: data.joinedBy,
      timestamp: Date.now(),
      isHost: data.player.isHost,
    };
  }

  // Handle GameGateway format: { playerId, nickname, timestamp }
  if (data.playerId) {
    return {
      playerId: data.playerId,
      nickname: data.nickname || 'Unknown',
      playerCount: data.playerCount,
      joinedBy: data.joinedBy,
      timestamp: data.timestamp || Date.now(),
      isHost: data.isHost,
    };
  }

  // Handle mixed format: { id, nickname, ... }
  if (data.id && data.nickname) {
    return {
      playerId: data.id,
      nickname: data.nickname,
      playerCount: data.playerCount,
      joinedBy: data.joinedBy,
      timestamp: data.timestamp || Date.now(),
      isHost: data.isHost,
    };
  }

  return null;
}

/**
 * Normalizes player_left payload from either RoomGateway or GameGateway format
 * to the unified PlayerLeftEvent format.
 */
export function normalizePlayerLeftEvent(data: any): PlayerLeftEvent | null {
  if (!data) return null;

  // Handle RoomGateway format: { playerId, nickname, playerCount, isHost }
  // Handle GameGateway format: { playerId, nickname, timestamp }
  // Handle mixed format with player object

  let playerId: string | undefined;
  let nickname: string | undefined;

  if (data.playerId) {
    playerId = data.playerId;
  } else if (data.player?.id) {
    playerId = data.player.id;
  } else if (data.id) {
    playerId = data.id;
  }

  if (data.nickname) {
    nickname = data.nickname;
  } else if (data.player?.nickname) {
    nickname = data.player.nickname;
  }

  if (!playerId) return null;

  return {
    playerId,
    nickname: nickname || 'Unknown',
    playerCount: data.playerCount,
    isHost: data.isHost || data.player?.isHost,
    timestamp: data.timestamp || Date.now(),
  };
}

/**
 * Creates a standardized player object
 */
export function createPlayerIdentity(
  playerId: string,
  nickname: string,
  extra?: { isHost?: boolean; roomId?: string; userId?: string }
) {
  return {
    playerId,
    nickname,
    ...(extra?.isHost !== undefined && { isHost: extra.isHost }),
    ...(extra?.roomId && { roomId: extra.roomId }),
    ...(extra?.userId && { userId: extra.userId }),
  };
}
