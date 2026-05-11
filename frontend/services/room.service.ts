import api from "@/lib/axios";

export const roomService = {
  // Tạo room mới
  async create(quizId: string) {
    const response = await api.post("/room", { quizId });
    return response.data;
  },

  // Lấy room theo ID
  async getById(id: string) {
    const response = await api.get(`/room/${id}`);
    return response.data;
  },

  // Lấy room theo PIN
  async getByPin(pin: string) {
    const response = await api.get(`/room/pin/${pin}`);
    return response.data;
  },

  // Lấy tất cả room đang chờ
  async getAll() {
    const response = await api.get("/room");
    return response.data;
  },

  // Join room (REST fallback)
  async join(pin: string, nickname: string) {
    const response = await api.post("/room/join", { pin, nickname });
    return response.data;
  },

  // Leave room (REST fallback)
  async leave(roomId: string, playerId: string) {
    const response = await api.post("/room/leave", { roomId, playerId });
    return response.data;
  },

  // Xóa room (host only)
  async delete(id: string) {
    const response = await api.delete(`/room/${id}`);
    return response.data;
  },
};
