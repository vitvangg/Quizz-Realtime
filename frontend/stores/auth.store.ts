import { create } from 'zustand';
import { toast } from 'sonner';
import { authState } from '@/types/auth.type';
import { authService } from '@/services/auth.service';
import api from '@/lib/axios';
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
            // Backend sẽ set refreshToken vào cookie
            const response = await api.post("/auth/login", { email, password }, {
                withCredentials: true
            });

            // Lưu accessToken vào state (KHÔNG lưu vào localStorage)
            const { accessToken, data: user } = response.data;
            set({
                accessToken,
                user,
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
            // Backend sẽ clear refreshToken cookie
            await api.post("/auth/logout", {}, { withCredentials: true })
                .catch(err => console.error("Logout API error:", err));
        } finally {
            set({ accessToken: null, user: null, loading: false });
            toast.success("Đăng xuất thành công!");
        }
    },

    getProfile: async () => {
        try {
            const response = await api.get("/auth/profile");
            set({ user: response.data });
            return response.data;
        } catch (error) {
            console.error("Get profile error:", error);
            throw error;
        }
    },

    refresh: async () => {
        try {
            set({ loading: true });
            const { user, getProfile } = get();
            
            // Gọi refresh token - backend sẽ đọc refreshToken từ cookie
            // và set refreshToken mới vào cookie
            const response = await api.post("/auth/refresh-token", {}, {
                withCredentials: true
            });
            
            const newAccessToken = response.data.accessToken;
            set({ accessToken: newAccessToken });

            if (!user) {
                await getProfile();
            }
            
            return newAccessToken;
        } catch (error) {
            // Refresh fail có thể do hết hạn hoặc không có token
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
            // Thử refresh token từ cookie (chỉ khi API available)
            const apiAvailable = await checkApiAvailable();
            if (!apiAvailable) {
                // API không khả dụng - có thể backend chưa start
                clearState();
                set({ isHydrated: true });
                return;
            }

            await refresh();
            const { user, accessToken } = get();
            if (accessToken && !user) {
                await getProfile();
            }
        } catch {
            // Không có valid refresh token - clear state
            clearState();
        } finally {
            set({ isHydrated: true });
        }
    },
}));

// Helper function để check API có khả dụng không
async function checkApiAvailable(): Promise<boolean> {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/auth/ping`, {
            method: 'GET',
            cache: 'no-store',
        });
        return response.ok || response.status === 404; // 404 cũng OK - API có respond
    } catch {
        return false;
    }
}
