"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, Save, ArrowLeft, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuizStore } from "@/stores/quiz.store";
import { useQuestionStore } from "@/stores/question.store";
import { useAnswerStore } from "@/stores/answer.store";
import { QuestionCard } from "@/components/quiz/question-card";

interface Answer {
  id: string;
  content: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  content: string;
  timeLimit: number;
  answers: Answer[];
}

export default function QuizBuilderPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  
  const quizStore = useQuizStore();
  const questionStore = useQuestionStore();
  const answerStore = useAnswerStore();

  const [questions, setQuestions] = useState<Question[]>([
    {
      id: "q-" + Date.now(),
      content: "",
      timeLimit: 20,
      answers: [
        { id: "a1-" + Date.now(), content: "", isCorrect: true },
        { id: "a2-" + Date.now(), content: "", isCorrect: false },
      ],
    },
  ]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: "q-" + Date.now(),
        content: "",
        timeLimit: 20,
        answers: [
          { id: "a1-" + Date.now(), content: "", isCorrect: true },
          { id: "a2-" + Date.now(), content: "", isCorrect: false },
        ],
      },
    ]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, field: keyof Question, value: any) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const addAnswer = (questionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.answers.length < 4) {
          return {
            ...q,
            answers: [
              ...q.answers,
              { id: "a-" + Date.now(), content: "", isCorrect: false },
            ],
          };
        }
        return q;
      })
    );
  };

  const removeAnswer = (questionId: string, answerId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.answers.length > 2) {
          const newAnswers = q.answers.filter((a) => a.id !== answerId);
          // Nếu xóa trúng đáp án đúng, set cái đầu tiên làm đúng
          if (q.answers.find(a => a.id === answerId)?.isCorrect) {
            newAnswers[0].isCorrect = true;
          }
          return { ...q, answers: newAnswers };
        }
        return q;
      })
    );
  };

  const updateAnswer = (questionId: string, answerId: string, field: keyof Answer, value: any) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId) {
          return {
            ...q,
            answers: q.answers.map((a) => {
              if (a.id === answerId) {
                return { ...a, [field]: value };
              }
              if (field === "isCorrect" && value === true) {
                 return { ...a, isCorrect: false };
              }
              return a;
            }),
          };
        }
        return q;
      })
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Vui lòng nhập tên Quiz!");
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].content.trim()) {
        toast.error(`Câu hỏi ${i + 1} chưa có nội dung!`);
        return;
      }
      const hasCorrect = questions[i].answers.some(a => a.isCorrect);
      if (!hasCorrect) {
        toast.error(`Câu hỏi ${i + 1} chưa chọn đáp án đúng!`);
        return;
      }
      const hasEmptyAnswer = questions[i].answers.some(a => !a.content.trim());
      if (hasEmptyAnswer) {
        toast.error(`Câu hỏi ${i + 1} có đáp án trống!`);
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Tạo Quiz
      const newQuiz = await quizStore.create({ 
        title
      });
      
      const quizId = newQuiz.id;

      // 2. Tạo Questions & Answers tuần tự
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const newQuestion = await questionStore.create({
          quizId,
          content: q.content,
          timeLimit: q.timeLimit,
          orderIndex: i
        });

        const questionId = newQuestion.id;

        // 3. Tạo Answers cho từng Question
        for (const a of q.answers) {
          await answerStore.create({
            questionId,
            content: a.content,
            isCorrect: a.isCorrect
          });
        }
      }

      toast.success("Tạo trọn bộ Quiz thành công!");
      router.push("/quiz"); // Chuyển về trang chủ của user
    } catch (error: any) {
      console.error("Lỗi khi lưu Quiz:", error);
      const message = error.response?.data?.message || "Có lỗi xảy ra khi lưu Quiz.";
      if (Array.isArray(message)) {
        toast.error(message.join(", "));
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 pb-32">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-10 bg-background/80 backdrop-blur-md py-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/admin/quizzes">
            <Button variant="outline" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tạo Quiz Mới</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <LayoutGrid className="h-3 w-3" /> Thiết kế bộ câu hỏi của bạn
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Hủy bỏ
          </Button>
          <Button className="gap-2 px-8 shadow-lg shadow-primary/20" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Đang lưu..." : "Lưu Quiz"}
          </Button>
        </div>
      </div>

      {/* Quiz Info Card */}
      <Card className="border-2 border-primary/10 shadow-sm">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-base font-bold text-primary">Tên bộ Quiz</Label>
            <Input
              id="title"
              placeholder="Ví dụ: Kiểm tra kiến thức React cơ bản..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-semibold py-6 border-2 focus-visible:border-primary transition-all"
            />
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      <div className="space-y-10">
        {questions.map((q, index) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={index}
            onUpdate={updateQuestion}
            onRemove={removeQuestion}
            onUpdateAnswer={updateAnswer}
            onAddAnswer={addAnswer}
            onRemoveAnswer={removeAnswer}
            canRemove={questions.length > 1}
          />
        ))}
      </div>

      {/* Add Question Button */}
      <div className="flex justify-center pt-4">
        <Button 
          variant="outline" 
          size="lg" 
          className="gap-2 w-full max-w-md border-dashed border-2 py-8 text-lg hover:bg-primary/5 hover:border-primary/50 transition-all group" 
          onClick={addQuestion}
          disabled={saving}
        >
          <PlusCircle className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
          Thêm câu hỏi mới
        </Button>
      </div>

      {/* Bottom Save Bar (Mobile) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] md:hidden z-20">
         <Button className="w-full gap-2 py-6 text-lg shadow-xl" onClick={handleSave} disabled={saving}>
            <Save className="h-5 w-5" />
            {saving ? "Đang lưu..." : "Lưu Quiz ngay"}
         </Button>
      </div>
    </div>
  );
}
