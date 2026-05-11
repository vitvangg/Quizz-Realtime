'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useRoomStore } from '@/stores/room.store';
import { toast } from 'sonner';

interface JoinRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinRoomDialog({ open, onOpenChange }: JoinRoomDialogProps) {
  const router = useRouter();
  const { joinRoom, loading, error, clearError } = useRoomStore();
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('[JoinRoomDialog] Submit:', { pin, nickname });
    
    if (pin.length !== 6) {
      toast.error('Mã PIN phải có 6 chữ số');
      return;
    }
    
    if (!nickname.trim()) {
      toast.error('Vui lòng nhập nickname');
      return;
    }

    try {
      console.log('[JoinRoomDialog] Calling joinRoom...');
      await joinRoom(pin, nickname);
      console.log('[JoinRoomDialog] joinRoom succeeded');
      const room = useRoomStore.getState().currentRoom;
      toast.success('Tham gia phòng thành công!');
      onOpenChange(false);
      if (room) {
        console.log('[JoinRoomDialog] Navigating to room:', room.id);
        router.push(`/room/${room.id}`);
      }
    } catch (err) {
      console.error('[JoinRoomDialog] joinRoom failed:', err);
      toast.error(error || 'Không thể tham gia phòng');
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setPin('');
      setNickname('');
      clearError();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tham gia phòng</DialogTitle>
          <DialogDescription>
            Nhập mã phòng và nickname để tham gia game
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pin">Mã phòng</Label>
            <Input
              id="pin"
              placeholder="000000"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="text-center text-xl tracking-widest font-bold"
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              placeholder="Tên của bạn"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 20))}
              maxLength={20}
              disabled={loading}
            />
          </div>
          
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          
          <Button type="submit" className="w-full" disabled={loading || pin.length !== 6}>
            {loading ? 'Đang tham gia...' : 'Tham gia'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
