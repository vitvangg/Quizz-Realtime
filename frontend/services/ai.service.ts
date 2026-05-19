import axiosInstance from "@/lib/axios";

export const generateQuizAI = async (topic: string, amount: number = 5, requirements?: string) => {
    const response = await axiosInstance.post(`/ai/generate-quiz`, {
        topic,
        amount,
        requirements
    }, {
        timeout: 60000 // 60 seconds for AI generation
    });

    return response.data;
};