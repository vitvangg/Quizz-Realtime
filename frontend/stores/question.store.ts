import { create } from "zustand";
import { toast } from "sonner";
import { questionService } from "@/services/question.service";
import axios from "axios";

interface QuestionState {
  questions: any[];
  loading: boolean;

  getByQuizId: (quizId: string) => Promise<void>;
  create: (data: any) => Promise<any>;
  update: (id: string, data: any) => Promise<void>;
  uploadImage: (id: string, file: File) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
};

export const useQuestionStore = create<QuestionState>((set) => ({
  questions: [],
  loading: false,

  getByQuizId: async (quizId) => {
    try {
      set({ loading: true });
      const data = await questionService.getByQuizId(quizId);
      set({ questions: data });
    } catch (error) {
      toast.error(getErrorMessage(error, "Load question thất bại"));
    } finally {
      set({ loading: false });
    }
  },

  create: async (data) => {
    try {
      set({ loading: true });
      const newQ = await questionService.create(data);
      set((state) => ({
        questions: [...state.questions, newQ],
      }));
      return newQ;
    } catch (error) {
      toast.error(getErrorMessage(error, "Tạo question thất bại"));
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  update: async (id, data) => {
    try {
      set({ loading: true });
      const updated = await questionService.update(id, data);
      set((state) => ({
        questions: state.questions.map((q) =>
          q.id === id ? updated : q
        ),
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Update thất bại"));
    } finally {
      set({ loading: false });
    }
  },

  uploadImage: async (id, file) => {
    try {
      set({ loading: true });
      const updated = await questionService.uploadImage(id, file);
      set((state) => ({
        questions: state.questions.map((q) =>
          q.id === id ? updated : q
        ),
      }));
      toast.success("Upload ảnh thành công!");
    } catch (error) {
      toast.error(getErrorMessage(error, "Upload ảnh thất bại"));
    } finally {
      set({ loading: false });
    }
  },

  delete: async (id) => {
    try {
      set({ loading: true });
      await questionService.delete(id);
      set((state) => ({
        questions: state.questions.filter((q) => q.id !== id),
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Xóa thất bại"));
    } finally {
      set({ loading: false });
    }
  },
}));
