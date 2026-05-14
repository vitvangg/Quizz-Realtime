import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
    private genAI: GoogleGenerativeAI;

    constructor() {
        this.genAI = new GoogleGenerativeAI(
            process.env.GEMINI_API_KEY!,
        );
    }

    async generateQuiz(topic: string, amount: number = 5, requirements?: string) {
        const model = this.genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
            }
        });

        const prompt = `
    Tạo ${amount} câu hỏi trắc nghiệm về chủ đề "${topic}".
    ${requirements ? `Yêu cầu thêm: ${requirements}` : ''}

    Dựa trên chủ đề, hãy chọn một trong các danh mục (category) sau đây:
    TOAN, VAT_LI, HOA_HOC, SINH_HOC, VAN_HOC, LICH_SU, DIA_LY, TIENG_ANH, CONG_NGHE, KHAC.

    Trả về JSON dạng OBJECT:
    {
      "category": "Tên danh mục (ví dụ: TOAN)",
      "questions": [
        {
          "content": "Câu hỏi",
          "timeLimit": 20,
          "answers": [
            {
              "content": "Đáp án",
              "isCorrect": true
            }
          ]
        }
      ]
    }
    `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
            return JSON.parse(text);
        } catch (e) {
            // Fallback: cố gắng trích xuất JSON nếu AI vẫn trả về markdown
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error("AI trả về định dạng không hợp lệ");
        }
    }
}