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
};