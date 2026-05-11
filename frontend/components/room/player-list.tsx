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
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">
          Người chơi ({players.length})
        </h3>
      </div>
      
      <div className="space-y-2">
        {players.map((player) => {
          const isPlayerHost = hostId ? player.id === hostId : player.isHost;
          
          return (
            <div
              key={player.id}
              className={`
                flex items-center justify-between p-3 rounded-lg
                ${isPlayerHost ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}
                ${currentPlayerId === player.id ? 'ring-2 ring-primary' : ''}
              `}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{player.nickname}</span>
                  {isPlayerHost && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Crown className="w-3 h-3" />
                      Host
                    </span>
                  )}
                  {currentPlayerId === player.id && (
                    <span className="text-xs text-muted-foreground">(Bạn)</span>
                  )}
                </div>
              </div>
              
              {isHost && !isPlayerHost && onKickPlayer && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onKickPlayer(player.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        })}
        
        {players.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            Chưa có người chơi nào
          </p>
        )}
      </div>
    </div>
  );
}
