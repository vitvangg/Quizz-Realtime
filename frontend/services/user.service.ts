import axiosInstance from "@/lib/axios";

export const userService = {
    updateProfile: async (data: {
        fullName?: string;
        avatar?: string;
        phoneNumber?: string;
        bio?: string;
    }) => {
        const response = await axiosInstance.patch("/user/profile", data);
        return response.data;
    },
    uploadAvatar: async (file: File) => {
        const formData = new FormData();
        formData.append("fileAvatar", file);
        const response = await axiosInstance.post("/user/upload-avatar", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return response.data;
    },
    create: async (data: any) => {
        const response = await axiosInstance.post("/user", data);
        return response.data;
    },
    getAll: async () => {
        const response = await axiosInstance.get("/user");
        return response.data;
    },
    getById: async (id: string) => {
        const response = await axiosInstance.get(`/user/${id}`);
        return response.data;
    },
    update: async (id: string, data: any) => {
        const response = await axiosInstance.patch(`/user/${id}`, data);
        return response.data;
    },
    delete: async (id: string) => {
        const response = await axiosInstance.delete(`/user/${id}`);
        return response.data;
    },
    getRoles: async () => {
        const response = await axiosInstance.get("/admin/roles");
        return response.data;
    },
    };