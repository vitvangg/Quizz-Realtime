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
};