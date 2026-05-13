"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { 
  PlusCircle, 
  Save, 
  ArrowLeft, 
  LayoutGrid, 
  Loader2,
  Info,
  FileText 
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuizStore } from "@/stores/quiz.store";
import { useQuestionStore } from "@/stores/question.store";
import { useAnswerStore } from "@/stores/answer.store";
import { QuestionCard } from "@/components/quiz/question-card";
import { quizService } from "@/services/quiz.service";
import { QuizCategory, CATEGORY_LABELS } from "@/types/quiz.type";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [category, setCategory] = useState<QuizCategory>(QuizCategory.KHAC);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const quizStore = useQuizStore();
  const questionStore = useQuestionStore();
  const answerStore = useAnswerStore();

  const [questions, setQuestions] = useState<Question[]>([]);

  const loadQuizData = useCallback(async () => {
    try {
      setLoading(true);
      const quiz = await quizService.getById(quizId);
      setTitle(quiz.title);
      setCategory(quiz.category || QuizCategory.KHAC);

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

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: "q-" + Date.now() + Math.random(),
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
              { id: "a-" + Date.now() + Math.random(), content: "", isCorrect: false },
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
      await quizStore.update(quizId, { title, category });
      const currentQuizData = await quizService.getById(quizId);

      if (currentQuizData.questions && currentQuizData.questions.length > 0) {
        await Promise.all(
          currentQuizData.questions.map((q: any) => questionStore.delete(q.id))
        );
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const newQuestion = await questionStore.create({
          quizId,
          content: q.content,
          timeLimit: q.timeLimit,
          orderIndex: i
        });

        const questionId = newQuestion.id;
        for (const a of q.answers) {
          await answerStore.create({
            questionId,
            content: a.content,
            isCorrect: a.isCorrect
          });
        }
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
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground font-black animate-pulse uppercase tracking-widest">Đang tải nội dung...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-12 pb-32">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-16 z-40 bg-background/90 backdrop-blur-xl py-6 border-b transition-all duration-300">
        <div className="flex items-center gap-5">
          <Link href="/quiz">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-2xl bg-muted hover:bg-primary hover:text-white transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>

          <div>
            <h1 className="text-3xl font-black tracking-tighter">
              Chỉnh sửa Quiz
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              Cập nhật nội dung thử thách
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            className="gap-2 px-8 py-6 rounded-2xl shadow-xl shadow-primary/20 font-black text-lg transition-all hover:scale-105"
            onClick={handleUpdate}
            disabled={saving}
          >
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      </div>

      {/* QUIZ INFO SECTION */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-2 text-primary">
          <Info className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-widest">Thông tin cơ bản</span>
        </div>
        <Card className="border-2 border-primary/10 shadow-sm bg-gradient-to-br from-background to-muted/30 overflow-hidden rounded-3xl">
          <CardContent className="pt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="title" className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                  Tên bộ sưu tập
                </Label>
                <Input
                  id="title"
                  placeholder="Tên Quiz..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-2xl font-black py-8 border-2 border-transparent bg-background focus:border-primary/50 transition-all rounded-2xl"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="category" className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                  Danh mục
                </Label>
                <Select value={category} onValueChange={(value) => setCategory(value as QuizCategory)}>
                  <SelectTrigger className="text-xl font-black py-8 border-2 border-transparent bg-background focus:border-primary/50 transition-all rounded-2xl h-auto">
                    <SelectValue placeholder="Chọn danh mục" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-2">
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="py-3 font-bold rounded-xl">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* QUESTIONS LIST */}
      <section className="space-y-10">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-primary">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">Danh sách câu hỏi ({questions.length})</span>
          </div>
        </div>

        <div className="space-y-8">
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
      </section>

      {/* ADD QUESTION BUTTON */}
      <div className="flex justify-center pt-8">
        <Button
          variant="outline"
          className="group gap-3 w-full max-w-lg border-dashed border-2 py-12 text-xl font-black rounded-3xl hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all duration-300"
          onClick={addQuestion}
          disabled={saving}
        >
          <div className="bg-primary/10 p-2 rounded-xl group-hover:bg-primary group-hover:text-white transition-colors">
            <PlusCircle className="h-8 w-8" />
          </div>
          Thêm câu hỏi tiếp theo
        </Button>
      </div>
    </div>
  );
}