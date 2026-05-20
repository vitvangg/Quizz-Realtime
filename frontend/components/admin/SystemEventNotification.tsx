'use client';

import { useEffect } from 'react';
import { getGameSocket } from '@/lib/game-socket';
import { useGameStore } from '@/stores/game.store';
import { toast } from 'sonner';

export default function SystemEventNotification() {
  const isFrozen = useGameStore(state => state.isFrozen);
  const isMaintenance = useGameStore(state => state.isMaintenance);

  useEffect(() => {
    const socket = getGameSocket();
    
    const handleFreeze = (data: { enable: boolean; message: string }) => {
      useGameStore.setState({ isFrozen: data.enable, freezeMessage: data.message });
      if (data.enable) {
        toast.error(data.message || 'Hệ thống đã bị đóng băng vì lý do bảo mật!', { 
          duration: Infinity, 
          id: 'sys-freeze' 
        });
      } else {
        toast.success(data.message || 'Hệ thống đã hoạt động trở lại.', { id: 'sys-freeze' });
        setTimeout(() => toast.dismiss('sys-freeze'), 3000);
      }
    };
    
    const handleMaintenance = (data: { enable: boolean; message: string }) => {
      useGameStore.setState({ isMaintenance: data.enable, maintenanceMessage: data.message });
      if (data.enable) {
        toast.warning(data.message || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.', { 
          duration: Infinity, 
          id: 'sys-main' 
        });
      } else {
        toast.dismiss('sys-main');
      }
    };

    socket.on('system:freeze', handleFreeze);
    socket.on('system:maintenance', handleMaintenance);

    return () => {
      socket.off('system:freeze', handleFreeze);
      socket.off('system:maintenance', handleMaintenance);
    };
  }, []);

  if (!isFrozen && !isMaintenance) return null;

  return (
    <div 
      className="fixed inset-0 z-[99999] cursor-not-allowed" 
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }} // Rất mờ, gần như trong suốt nhưng chặn click
      title="Hệ thống đang tạm dừng"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toast.error('Hệ thống đang tạm dừng, bạn không thể thao tác lúc này.');
      }}
    >
      {/* Vô hình nhưng chặn tất cả các event chuột */}
    </div>
  );
}
