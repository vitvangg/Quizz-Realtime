import api from "@/lib/axios";
export const answerService = {
  async create(data: {
    questionId: string;
    content: string;
    isCorrect: boolean;
  }) {
    const res = await api.post("/answers", data);
    return res.data;
  },

  async getByQuestionId(questionId: string) {
    const res = await api.get(`/answers/question/${questionId}`);
    return res.data;
  },

  async update(id: string, data: any) {
    const res = await api.patch(`/answers/${id}`, data);
    return res.data;
  },

  async delete(id: string) {
    const res = await api.delete(`/answers/${id}`);
    return res.data;
  },
};