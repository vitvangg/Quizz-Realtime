import api from "@/lib/axios";

export const quizService = {

    // Tạo quiz
    async create(data: {
        title: string;
        description?: string;
    }) {
        const response = await api.post("/quizzs", data);
        return response.data;
    },

    // Lấy tất cả quiz
    async getAll() {
        const response = await api.get("/quizzs");
        return response.data;
    },

    // Lấy quiz của user hiện tại
    async getMyQuizzes() {
        const response = await api.get("/quizzs/user");
        return response.data;
    },

    // Lấy chi tiết 1 quiz
    async getById(id: string) {
        const response = await api.get(`/quizzs/${id}`);
        return response.data;
    },

    // Update quiz
    async update(id: string, data: {
        title?: string;
        description?: string;
    }) {
        const response = await api.patch(`/quizzs/${id}`, data);
        return response.data;
    },

    // Xóa quiz
    async delete(id: string) {
        const response = await api.delete(`/quizzs/${id}`);
        return response.data;
    },

    // Search quiz
    async search(q: string) {
        const response = await api.get(`/quizzs/search?q=${q}`);
        return response.data;
    }
};