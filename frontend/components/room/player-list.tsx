'use client';

import { User, Crown, X } from 'lucide-react';
import { Player } from '@/types/room.type';
import { Button } from '@/components/ui/button';

interface PlayerListProps {
  players: Player[];
  isHost: boolean;
  currentPlayerId?: string;
  hostId?: string;
  onKickPlayer?: (playerId: string) => void;
}

export function PlayerList({ 
  players, 
  isHost, 
  currentPlayerId,
  hostId,
  onKickPlayer 
}: PlayerListProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-lg uppercase tracking-wide">
          Người chơi ({players.length})
        </h3>
      </div>
      
      <div className="space-y-2">
        {players.map((player, index) => {
          const isPlayerHost = hostId ? player.id === hostId : player.isHost;
          const isCurrentPlayer = currentPlayerId === player.id;
          
          return (
            <div
              key={player.id}
              className={`
                flex items-center justify-between p-4 rounded-xl border-4 border-black
                ${isCurrentPlayer 
                  ? 'bg-neon-yellow shadow-brutal-sm' 
                  : isPlayerHost 
                    ? 'bg-neon-pink shadow-brutal-sm' 
                    : 'bg-white shadow-brutal-sm'
                }
                ${isCurrentPlayer ? '' : 'hover:-translate-y-0.5 transition-transform'}
              `}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg border-4 border-black flex items-center justify-center font-black text-lg ${
                  isPlayerHost ? 'bg-neon-orange text-white' : 'bg-neon-blue text-white'
                }`}>
                  {isPlayerHost ? (
                    <Crown className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{player.nickname}</span>
                  {isCurrentPlayer && (
                    <span className="text-xs font-bold uppercase bg-black text-white px-2 py-0.5 rounded">Bạn</span>
                  )}
                </div>
              </div>
              
              {isHost && !isPlayerHost && onKickPlayer && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="bg-red-500 text-white border-2 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
                  onClick={() => onKickPlayer(player.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        })}
        
        {players.length === 0 && (
          <div className="text-center py-12 border-4 border-dashed border-black rounded-xl bg-white">
            <p className="font-bold text-black/50 uppercase tracking-wide">
              Chưa có người chơi nào
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
