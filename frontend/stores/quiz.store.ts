import { create } from "zustand";
import { toast } from "sonner";
import { quizService } from "@/services/quiz.service";
import axios from "axios";

interface QuizState {
  quizzes: any[];
  currentQuiz: any | null;
  loading: boolean;

  getAll: () => Promise<void>;
  getMyQuizzes: () => Promise<void>;
  getById: (id: string) => Promise<void>;
  create: (data: { title: string; description?: string }) => Promise<any>;
  update: (id: string, data: any) => Promise<void>;
  delete: (id: string) => Promise<void>;
  search: (q: string) => Promise<void>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
};

export const useQuizStore = create<QuizState>((set) => ({
  quizzes: [],
  currentQuiz: null,
  loading: false,

  getAll: async () => {
    try {
      set({ loading: true });
      const data = await quizService.getAll();
      set({ quizzes: data });
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi load quiz"));
    } finally {
      set({ loading: false });
    }
  },

  getMyQuizzes: async () => {
    try {
      set({ loading: true });
      const data = await quizService.getMyQuizzes();
      set({ quizzes: data });
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi load quiz của bạn"));
    } finally {
      set({ loading: false });
    }
  },

  getById: async (id) => {
    try {
      set({ loading: true });
      const data = await quizService.getById(id);
      set({ currentQuiz: data });
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi load quiz"));
    } finally {
      set({ loading: false });
    }
  },

  create: async (data) => {
    try {
      set({ loading: true });
      const newQuiz = await quizService.create(data);
      set((state) => ({
        quizzes: [newQuiz, ...state.quizzes],
      }));
      return newQuiz;
    } catch (error) {
      toast.error(getErrorMessage(error, "Tạo quiz thất bại"));
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  update: async (id, data) => {
    try {
      set({ loading: true });
      const updated = await quizService.update(id, data);
      set((state) => ({
        quizzes: state.quizzes.map((q) =>
          q.id === id ? updated : q
        ),
      }));
      return updated;
    } catch (error) {
      toast.error(getErrorMessage(error, "Update thất bại"));
    } finally {
      set({ loading: false });
    }
  },

  delete: async (id) => {
    try {
      set({ loading: true });
      await quizService.delete(id);
      set((state) => ({
        quizzes: state.quizzes.filter((q) => q.id !== id),
      }));
      toast.success("Xóa quiz thành công");
    } catch (error) {
      toast.error(getErrorMessage(error, "Xóa thất bại"));
    } finally {
      set({ loading: false });
    }
  },
  search: async (q) => {
    try {
      set({ loading: true });
      const data = await quizService.search(q);
      set({ quizzes: data });
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi load quiz"));
    } finally {
      set({ loading: false });
    }
  },
}));