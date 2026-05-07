'use client';

import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { PlayerList } from './PlayerList';
import type { Room, Player } from '../../types/game';

interface WaitingRoomProps {
  room: Room;
  players: Player[];
  currentPlayerId?: string;
  isHost: boolean;
  onStartGame?: () => void;
  onKickPlayer?: (playerId: string) => void;
  isStarting?: boolean;
}

export function WaitingRoom({
  room,
  players,
  currentPlayerId,
  isHost,
  onStartGame,
  onKickPlayer,
  isStarting = false,
}: WaitingRoomProps) {
  const handleCopyPin = async () => {
    try {
      await navigator.clipboard.writeText(room.pin);
      toast.success('PIN copied to clipboard!');
    } catch {
      toast.error('Failed to copy PIN');
    }
  };

  const handleSharePin = async () => {
    const shareData = {
      title: 'Join My Quiz Game!',
      text: `Join my quiz game with code: ${room.pin}`,
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled share
      }
    } else {
      handleCopyPin();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Waiting Room</h1>
              <p className="text-sm text-gray-500">
                {isHost ? 'You are the host' : 'You are a player'}
              </p>
            </div>

            {/* PIN Display */}
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 rounded-lg px-4 py-2">
                <p className="text-xs text-gray-500 uppercase">Room PIN</p>
                <p className="text-2xl font-bold font-mono tracking-wider">{room.pin}</p>
              </div>
              <button
                onClick={handleCopyPin}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Copy PIN"
              >
                <Copy className="w-5 h-5" />
              </button>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  onClick={handleSharePin}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Share PIN"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Quiz Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Quiz</h3>
              <p className="text-lg font-medium">{room.quiz?.title || 'Unknown Quiz'}</p>
              <p className="text-sm text-gray-500 mt-1">
                {room.quiz?.questions?.length || 0} questions
              </p>
            </div>
          </div>

          {/* Player List */}
          <div className="lg:col-span-2">
            <PlayerList
              players={players}
              currentPlayerId={currentPlayerId}
              isHost={isHost}
              onKick={onKickPlayer}
              maxPlayers={50}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-center">
          {isHost ? (
            <button
              onClick={onStartGame}
              disabled={players.length === 0 || isStarting}
              className="px-8 py-4 bg-green-600 text-white font-semibold text-lg rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStarting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Starting...
                </span>
              ) : (
                'Start Game'
              )}
            </button>
          ) : (
            <div className="text-center">
              <div className="px-8 py-4 bg-gray-200 text-gray-600 font-semibold text-lg rounded-lg cursor-not-allowed">
                Waiting for host to start...
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {players.length} player{players.length !== 1 ? 's' : ''} in room
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
