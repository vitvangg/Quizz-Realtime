import { create } from 'zustand';
import { toast } from 'sonner';
import { authState } from '@/types/auth.type';
import { authService } from '@/services/auth.service';
import axios from 'axios';

const getErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
        const serverMessage = error.response?.data?.message;
        if (typeof serverMessage === "string") {
            return serverMessage;
        }
    }
    return fallback;
};

// store quan lý state
export const useAuthStore = create<authState>((set, get) => ({
    accessToken: null,
    user: null,
    loading: false,
    isHydrated: false,
    setAccessToken: (accessToken: string | null) => {
        set({ accessToken });
    },
    setHydrated: (value: boolean) => {
        set({ isHydrated: value });
    },

    clearState: () => set({
        accessToken: null,
        user: null,
        loading: false,
        isHydrated: true,
    }),

    register: async (email, password) => {
        try {
            set({ loading: true });
            const data = await authService.register(email, password);
            set({
                accessToken: data.accessToken,
                user: data.user,
            });
            toast.success("Đăng ký thành công! Bạn có thể đăng nhập ngay bây giờ.");
        } catch (error: unknown) {
            console.error("Register error:", error);
            const serverMessage = getErrorMessage(error, "Lỗi không xác định.");
            toast.error(`Đăng ký thất bại: ${serverMessage || "Lỗi không xác định."}`);
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    login: async (email, password) => {
        try {
            set({ loading: true });
            // Goi API để đăng nhập người dùng
            const data = await authService.login(email, password);

            // Lưu token vào axios để tự động gửi trong các yêu cầu sau
            set({
                accessToken: data.accessToken,
                user: data.data,
            });

            toast.success("Đăng nhập thành công!");
        } catch (error: unknown) {
            console.error("Login error:", error);
            const serverMessage = getErrorMessage(error, "Lỗi không xác định.");
            toast.error(`Đăng nhập thất bại: ${serverMessage || "Lỗi không xác định."}`);
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    logout: async () => {
        try {
            set({ loading: true });
            await authService.logout();
            set({ accessToken: null, user: null });

            toast.success("Đăng xuất thành công!");
        } catch (error: unknown) {
            console.error("Logout error:", error);
            const serverMessage = getErrorMessage(error, "Lỗi không xác định.");
            toast.error(`Đăng xuất thất bại: ${serverMessage || "Lỗi không xác định."}`);
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    getProfile: async () => {
        try {
            const profile = await authService.getProfile();
            set({ user: profile });
            return profile;
        } catch (error) {
            console.error("Get profile error:", error);
            throw error;
        }
    },

    refresh: async () => {
        try {
            set({ loading: true });
            const { user, getProfile } = get();
            const newAccessToken = await authService.refresh();
            set({ accessToken: newAccessToken });

            if (!user) {
                await getProfile();
            }
        } catch (error) {
            if (!axios.isAxiosError(error) || error.response?.status !== 401) {
                console.error("Refresh token error:", error);
            }
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    initAuth: async () => {
        const { isHydrated, refresh, getProfile, clearState } = get();
        if (isHydrated) return;

        try {
            await refresh();
            const { user, accessToken } = get();
            if (accessToken && !user) {
                await getProfile();
            }
        } catch {
            clearState();
        } finally {
            set({ isHydrated: true });
        }
    },
}));
