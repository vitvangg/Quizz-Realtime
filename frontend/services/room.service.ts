import api from "@/lib/axios";
import { CreateRoomDto, JoinRoomDto, Room } from "@/types/room.type";

export const roomService = {
  async create(data: CreateRoomDto): Promise<Room> {
    const response = await api.post("/room", data);
    return response.data;
  },

  async getById(id: string): Promise<Room> {
    const response = await api.get(`/room/${id}`);
    return response.data;
  },

  async getByPin(pin: string): Promise<Room> {
    const response = await api.get(`/room/pin/${pin}`);
    return response.data;
  },

  async join(data: JoinRoomDto): Promise<{ room: Room; player: any }> {
    const response = await api.post("/room/join", data);
    return response.data;
  },

  async leave(roomId: string, playerId: string): Promise<void> {
    await api.post("/room/leave", { roomId, playerId });
  },

  async getWaitingRooms(): Promise<Room[]> {
    const response = await api.get("/room");
    return response.data;
  },
};
