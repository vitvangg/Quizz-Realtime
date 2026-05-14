import { create } from "zustand";
import { userService } from "@/services/user.service";
import { useAuthStore } from "./auth.store";
import { toast } from "sonner";
import axios from "axios";

interface UserState {
    loading: boolean;
    updateProfile: (data: {
        fullName?: string;
        avatar?: string;
        phoneNumber?: string;
        bio?: string;
    }) => Promise<void>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
        return error.response?.data?.message || fallback;
    }
    return fallback;
};

export const useUserStore = create<UserState>((set) => ({
    loading: false,

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
}));