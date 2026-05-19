import api from "@/lib/axios";
export const questionService = {
  async create(data: {
    quizId: string;
    content: string;
    timeLimit: number;
    orderIndex: number;
  }) {
    const res = await api.post("/questions", data);
    return res.data;
  },

  async getByQuizId(quizId: string) {
    const res = await api.get(`/questions/quiz/${quizId}`);
    return res.data;
  },

  async update(id: string, data: any) {
    const res = await api.patch(`/questions/${id}`, data);
    return res.data;
  },

  async delete(id: string) {
    const res = await api.delete(`/questions/${id}`);
    return res.data;
  },

  async uploadImage(id: string, file: File) {
    const formData = new FormData();
    console.log(id);

    formData.append("file", file);
    const res = await api.post(`/questions/${id}/upload-image`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 60000, // 60 seconds for image upload
    });
    return res.data;
  },
};