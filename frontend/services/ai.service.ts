import axiosInstance from "@/lib/axios";

export const generateQuizAI = async (topic: string, amount: number = 5, requirements?: string) => {
    const response = await axiosInstance.post(`/ai/generate-quiz`, {
        topic,
        amount,
        requirements
    });

    return response.data;
};