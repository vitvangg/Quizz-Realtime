import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
    private genAI: GoogleGenerativeAI;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("WARNING: GEMINI_API_KEY is not defined in environment variables!");
        }
        this.genAI = new GoogleGenerativeAI(apiKey || "");
    }

    async generateQuiz(topic: string, amount: number = 5, requirements?: string) {
        console.log(`Generating quiz for topic: ${topic}, amount: ${amount}`);
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

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log("AI Response text length:", text.length);

            try {
                return JSON.parse(text);
            } catch (e) {
                // Fallback: cố gắng trích xuất JSON nếu AI vẫn trả về markdown
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                console.error("Failed to parse AI response as JSON:", text);
                throw new Error("AI trả về định dạng không hợp lệ");
            }
        } catch (error) {
            console.error("Gemini AI Error:", error);
            throw error;
        }
    }
}