"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, Save, ArrowLeft, LayoutGrid, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuizStore } from "@/stores/quiz.store";
import { useQuestionStore } from "@/stores/question.store";
import { useAnswerStore } from "@/stores/answer.store";
import { QuestionCard } from "@/components/quiz/question-card";
import { quizService } from "@/services/quiz.service";

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

export default function EditQuizPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const quizStore = useQuizStore();
  const questionStore = useQuestionStore();
  const answerStore = useAnswerStore();

  const [questions, setQuestions] = useState<Question[]>([]);

  // Load dữ liệu cũ và đổ vào form
  const loadQuizData = useCallback(async () => {
    try {
      setLoading(true);
      const quiz = await quizService.getById(quizId);
      setTitle(quiz.title);

      if (quiz.questions && quiz.questions.length > 0) {
        const formattedQuestions = quiz.questions.map((q: any) => ({
          id: q.id,
          content: q.content,
          timeLimit: q.timeLimit,
          answers: q.answers.map((a: any) => ({
            id: a.id,
            content: a.content,
            isCorrect: a.isCorrect
          }))
        }));
        setQuestions(formattedQuestions);
      } else {
        // Nếu quiz chưa có câu hỏi nào (trường hợp hiếm), tạo sẵn 1 câu trống
        setQuestions([{
          id: "q-" + Date.now(),
          content: "",
          timeLimit: 20,
          answers: [
            { id: "a1-" + Date.now(), content: "", isCorrect: true },
            { id: "a2-" + Date.now(), content: "", isCorrect: false },
          ],
        }]);
      }
    } catch (error) {
      toast.error("Không thể tải dữ liệu Quiz");
      router.push("/quiz");
    } finally {
      setLoading(false);
    }
  }, [quizId, router]);

  useEffect(() => {
    loadQuizData();
  }, [loadQuizData]);

  // Các logic điều khiển form (Giống hệt trang Create)
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

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    const newQuestions = [...questions];
    const [movedItem] = newQuestions.splice(index, 1);
    newQuestions.splice(newIndex, 0, movedItem);

    setQuestions(newQuestions);
  };

  const handleUpdate = async () => {
    if (!title.trim()) {
      toast.error("Vui lòng nhập tên Quiz!");
      return;
    }

    // Validate
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
    }

    setSaving(true);
    try {
      // 1. Cập nhật Tiêu đề Quiz
      await quizStore.update(quizId, { title });

      // 2. Lấy dữ liệu hiện tại để xóa
      const currentQuizData = await quizService.getById(quizId);

      // Xóa tất cả questions cũ một cách đồng thời và đợi tất cả hoàn tất
      if (currentQuizData.questions && currentQuizData.questions.length > 0) {
        await Promise.all(
          currentQuizData.questions.map((q: any) => questionStore.delete(q.id))
        );
      }

      // 3. Tạo lại toàn bộ từ đầu
      // Chúng ta tạo tuần tự để đảm bảo orderIndex đúng
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const newQuestion = await questionStore.create({
          quizId,
          content: q.content,
          timeLimit: q.timeLimit,
          orderIndex: i
        });

        const questionId = newQuestion.id;
        // Tạo các câu trả lời cho câu hỏi này
        await Promise.all(
          q.answers.map((a) => answerStore.create({
            questionId,
            content: a.content,
            isCorrect: a.isCorrect
          }))
        );
      }

      toast.success("Cập nhật bộ Quiz thành công!");
      router.push("/quiz");

    } catch (error) {
      toast.error("Có lỗi xảy ra khi lưu thay đổi");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground font-medium animate-pulse">Đang tải nội dung bộ Quiz...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 pb-32">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-16 z-40 bg-background/80 backdrop-blur-md py-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/quiz">
            <Button variant="outline" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chỉnh sửa bộ Quiz</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <LayoutGrid className="h-3 w-3" /> Thay đổi nội dung của các câu hỏi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Hủy bỏ
          </Button>
          <Button className="gap-2 px-8 shadow-lg shadow-primary/20" onClick={handleUpdate} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Đang lưu..." : "Cập nhật bộ Quiz"}
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
              placeholder="Tên bộ Quiz..."
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
            totalQuestions={questions.length}
            onUpdate={updateQuestion}
            onRemove={removeQuestion}
            onUpdateAnswer={updateAnswer}
            onAddAnswer={addAnswer}
            onRemoveAnswer={removeAnswer}
            onMove={moveQuestion}
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
    </div>
  );
}
