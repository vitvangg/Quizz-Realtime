'use client';

import type { Player } from '../../types/game';

interface PlayerListProps {
  players: Player[];
  currentPlayerId?: string;
  isHost: boolean;
  onKick?: (playerId: string) => void;
  maxPlayers?: number;
}

export function PlayerList({
  players,
  currentPlayerId,
  isHost,
  onKick,
  maxPlayers = 50,
}: PlayerListProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Players</h3>
          <span className="text-sm text-gray-500">
            {players.length} / {maxPlayers}
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
        {players.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            <p>No players in the room yet.</p>
            <p className="text-sm mt-1">Share the PIN to invite players!</p>
          </div>
        ) : (
          players.map((player) => (
            <PlayerItem
              key={player.id}
              player={player}
              isCurrentPlayer={player.id === currentPlayerId}
              isHost={isHost}
              canKick={isHost && !player.isHost}
              onKick={onKick}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface PlayerItemProps {
  player: Player;
  isCurrentPlayer: boolean;
  isHost: boolean;
  canKick: boolean;
  onKick?: (playerId: string) => void;
}

function PlayerItem({
  player,
  isCurrentPlayer,
  isHost: isHostView,
  canKick,
  onKick,
}: PlayerItemProps) {
  return (
    <div
      className={`
        px-4 py-3 flex items-center justify-between
        ${isCurrentPlayer ? 'bg-blue-50' : 'hover:bg-gray-50'}
      `}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className={`
            w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm
            ${player.isHost ? 'bg-purple-600' : 'bg-blue-500'}
          `}
        >
          {player.nickname.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isCurrentPlayer ? 'text-blue-700' : 'text-gray-900'}`}>
              {player.nickname}
              {isCurrentPlayer && ' (You)'}
            </span>
            {player.isHost && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                Host
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Kick Button (Host only) */}
      {canKick && onKick && (
        <button
          onClick={() => onKick(player.id)}
          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Kick player"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
