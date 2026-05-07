import { create } from "zustand";
import { toast } from "sonner";
import { answerService } from "@/services/answer.service";
import axios from "axios";

interface AnswerState {
  answers: any[];
  loading: boolean;

  getByQuestionId: (questionId: string) => Promise<void>;
  create: (data: any) => Promise<any>;
  update: (id: string, data: any) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
};

export const useAnswerStore = create<AnswerState>((set) => ({
  answers: [],
  loading: false,

  getByQuestionId: async (questionId) => {
    try {
      set({ loading: true });
      const data = await answerService.getByQuestionId(questionId);
      set({ answers: data });
    } catch (error) {
      toast.error(getErrorMessage(error, "Load answer thất bại"));
    } finally {
      set({ loading: false });
    }
  },

  create: async (data) => {
    try {
      set({ loading: true });
      const newA = await answerService.create(data);
      set((state) => ({
        answers: [...state.answers, newA],
      }));
      return newA;
    } catch (error) {
      toast.error(getErrorMessage(error, "Tạo answer thất bại"));
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  update: async (id, data) => {
    try {
      set({ loading: true });
      const updated = await answerService.update(id, data);
      set((state) => ({
        answers: state.answers.map((a) =>
          a.id === id ? updated : a
        ),
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Update thất bại"));
    } finally {
      set({ loading: false });
    }
  },

  delete: async (id) => {
    try {
      set({ loading: true });
      await answerService.delete(id);
      set((state) => ({
        answers: state.answers.filter((a) => a.id !== id),
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Xóa thất bại"));
    } finally {
      set({ loading: false });
    }
  },
}));