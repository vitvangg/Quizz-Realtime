import { apiClient } from '@/lib/apiClient';
import type { Room } from '@/types/game';

interface CreateRoomDto {
  quizId: string;
}

export const roomService = {
  // Tạo phòng mới (cần đăng nhập)
  async createRoom(dto: CreateRoomDto): Promise<Room> {
    const response = await apiClient.post<Room>('/room', dto);
    return response.data;
  },

  // Lấy phòng theo PIN
  async getRoomByPin(pin: string): Promise<Room> {
    const response = await apiClient.get<Room>(`/room/pin/${pin}`);
    return response.data;
  },

  // Lấy phòng theo ID
  async getRoomById(id: string): Promise<Room> {
    const response = await apiClient.get<Room>(`/room/${id}`);
    return response.data;
  },

  // Lấy danh sách phòng của user
  async getMyRooms(): Promise<Room[]> {
    const response = await apiClient.get<Room[]>('/room');
    return response.data;
  },

  // Tham gia phòng
  async joinRoom(pin: string, nickname: string): Promise<any> {
    const response = await apiClient.post('/room/join', { pin, nickname });
    return response.data;
  },

  // Rời phòng
  async leaveRoom(playerId: string): Promise<void> {
    await apiClient.post(`/room/leave/${playerId}`);
  },

  // Cập nhật trạng thái phòng
  async updateStatus(id: string, status: string): Promise<Room> {
    const response = await apiClient.patch<Room>(`/room/${id}/status`, { status });
    return response.data;
  },

  // Xóa phòng
  async deleteRoom(id: string): Promise<void> {
    await apiClient.delete(`/room/${id}`);
  },
};
