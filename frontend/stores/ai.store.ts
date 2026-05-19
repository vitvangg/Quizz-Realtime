import { create } from "zustand";
import { generateQuizAI } from "@/services/ai.service";
import { toast } from "sonner";
import axios from "axios";

interface AIState {
    loading: boolean;
    topic: string;
    amount: number;
    requirements: string;
    
    setTopic: (topic: string) => void;
    setAmount: (amount: number) => void;
    setRequirements: (requirements: string) => void;
    generate: () => Promise<any>;
    reset: () => void;
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
        return error.response?.data?.message || fallback;
    }
    return fallback;
};

export const useAIStore = create<AIState>((set, get) => ({
    loading: false,
    topic: "",
    amount: 5,
    requirements: "",

    setTopic: (topic) => set({ topic }),
    setAmount: (amount) => set({ amount }),
    setRequirements: (requirements) => set({ requirements }),

    generate: async () => {
        const { topic, amount, requirements } = get();
        if (!topic.trim()) {
            toast.error("Vui lòng nhập chủ đề!");
            return null;
        }

        try {
            set({ loading: true });
            const data = await generateQuizAI(topic, amount, requirements);
            
            const questionCount = data?.questions?.length || 0;
            if (questionCount > 0) {
                toast.success(`AI đã tạo ${questionCount} câu hỏi!`);
            }
            
            return data;
        } catch (error) {
            const message = getErrorMessage(error, "Không thể generate câu hỏi");
            toast.error(Array.isArray(message) ? message.join(", ") : message);
            return null;
        } finally {
            set({ loading: false });
        }
    },

    reset: () => set({
        topic: "",
        amount: 5,
        requirements: "",
        loading: false
    })
}));