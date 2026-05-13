import api from "@/lib/axios";

export const authService = {

    // Hàm đăng nhập
    async login(email: string, password: string) {
        const response = await api.post("/auth/login", {
            email,
            password
        });
        return response.data;
    },

    // Hàm đăng ký
    async register(email: string, password: string) {
        const response = await api.post("/auth/register", {
            email,
            password
        });
        return response.data;
    },

    // Hàm đăng xuất
    async logout() {
        const response = await api.post("/auth/logout");
        return response.data;
    },

    async getProfile() {
        const response = await api.get("/auth/profile");
        return response.data;
    },

    async refresh() {
        const response = await api.post("/auth/refresh-token")
        return response.data.accessToken;
    },

    async changePassword(data: any) {
        const response = await api.patch("/auth/change-password", data);
        return response.data;
    }
}
