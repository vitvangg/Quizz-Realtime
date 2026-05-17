/**
 * Socket Event Normalizer for Frontend
 * 
 * Provides utility functions to normalize player events from different gateways.
 * This ensures consistent payload format regardless of which gateway emitted the event.
 */

/**
 * Player identity with normalized format
 */
export interface NormalizedPlayer {
  playerId: string;
  nickname: string;
  isHost?: boolean;
}

/**
 * Normalizes player_joined payload from either RoomGateway or GameGateway format
 * to the unified format.
 */
export function normalizePlayerJoinedEvent(data: any): NormalizedPlayer | null {
  if (!data) return null;

  // Handle RoomGateway format: { player: { id, nickname }, playerCount, joinedBy }
  if (data.player && data.player.id) {
    return {
      playerId: data.player.id,
      nickname: data.player.nickname,
      isHost: data.player.isHost,
    };
  }

  // Handle GameGateway format: { playerId, nickname, timestamp }
  if (data.playerId) {
    return {
      playerId: data.playerId,
      nickname: data.nickname || 'Unknown',
      isHost: data.isHost,
    };
  }

  // Handle mixed format: { id, nickname, ... }
  if (data.id && data.nickname) {
    return {
      playerId: data.id,
      nickname: data.nickname,
      isHost: data.isHost,
    };
  }

  return null;
}

/**
 * Normalizes player_left payload from either RoomGateway or GameGateway format
 * to the unified format.
 */
export function normalizePlayerLeftEvent(data: any): { playerId: string; nickname: string } | null {
  if (!data) return null;

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
  };
}

/**
 * Safe array filter that handles null/undefined values
 */
export function safeArrayFilter<T>(arr: T[], predicate: (item: T | null | undefined) => item is T): T[] {
  return arr.filter(predicate);
}
