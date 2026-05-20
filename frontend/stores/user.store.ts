import { create } from "zustand";
import { userService } from "@/services/user.service";
import { useAuthStore } from "./auth.store";
import { toast } from "sonner";
import axios from "axios";

interface UserState {
    users: any[];
    roles: any[];
    loading: boolean;
    fetchUsers: () => Promise<void>;
    fetchRoles: () => Promise<void>;
    updateProfile: (data: {
        fullName?: string;
        avatar?: string;
        phoneNumber?: string;
        bio?: string;
    }) => Promise<void>;
    uploadAvatar: (file: File) => Promise<void>;
    createUser: (data: any) => Promise<void>;
    updateUser: (id: string, data: any) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
        return error.response?.data?.message || fallback;
    }
    return fallback;
};

export const useUserStore = create<UserState>((set, get) => ({
    users: [],
    roles: [],
    loading: false,

    fetchUsers: async () => {
        try {
            set({ loading: true });
            const users = await userService.getAll();
            set({ users });
        } catch (error) {
            console.error("Fetch users error:", error);
            toast.error("Không thể tải danh sách người dùng");
        } finally {
            set({ loading: false });
        }
    },

    fetchRoles: async () => {
        try {
            const roles = await userService.getRoles();
            set({ roles });
        } catch (error) {
            console.error("Fetch roles error:", error);
        }
    },

    updateProfile: async (data) => {
        try {
            set({ loading: true });
            const updatedUser = await userService.updateProfile(data);
            
            // Cập nhật user trong authStore
            useAuthStore.setState({ user: updatedUser });
            
            toast.success("Cập nhật hồ sơ thành công!");
        } catch (error) {
            console.error("Update profile error:", error);
            const message = getErrorMessage(error, "Cập nhật thất bại");
            toast.error(message);
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    uploadAvatar: async (file: File) => {
        try {
            set({ loading: true });
            const updatedUser = await userService.uploadAvatar(file);
            
            // Cập nhật user trong authStore
            useAuthStore.setState({ user: updatedUser });
            
            toast.success("Cập nhật ảnh đại diện thành công!");
        } catch (error) {
            console.error("Upload avatar error:", error);
            const message = getErrorMessage(error, "Upload thất bại");
            toast.error(message);
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    createUser: async (data) => {
        try {
            set({ loading: true });
            const newUser = await userService.create(data);
            
            // Cập nhật danh sách users local
            set({ users: [newUser, ...get().users] });
            
            toast.success("Tạo người dùng thành công!");
        } catch (error) {
            console.error("Create user error:", error);
            const message = getErrorMessage(error, "Tạo thất bại");
            toast.error(message);
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    updateUser: async (id, data) => {
        try {
            set({ loading: true });
            const updatedUser = await userService.update(id, data);
            
            // Cập nhật danh sách users local
            const users = get().users.map(u => u.id === id ? updatedUser : u);
            set({ users });
            
            toast.success("Cập nhật người dùng thành công!");
        } catch (error) {
            console.error("Update user error:", error);
            const message = getErrorMessage(error, "Cập nhật thất bại");
            toast.error(message);
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    deleteUser: async (id) => {
        try {
            set({ loading: true });
            await userService.delete(id);
            
            // Xóa khỏi danh sách local
            const users = get().users.filter(u => u.id !== id);
            set({ users });
            
            toast.success("Xóa người dùng thành công!");
        } catch (error) {
            console.error("Delete user error:", error);
            const message = getErrorMessage(error, "Xóa thất bại");
            toast.error(message);
            throw error;
        } finally {
            set({ loading: false });
        }
    },
}));
