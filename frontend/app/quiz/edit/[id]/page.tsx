"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  PlusCircle,

  ArrowLeft,

  Info,
  FileText,
  Menu,
  X
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuizStore } from "@/stores/quiz.store";
import { useQuestionStore } from "@/stores/question.store";
import { useAnswerStore } from "@/stores/answer.store";
import { QuestionCard } from "@/components/quiz/question-card";
import { quizService } from "@/services/quiz.service";
import { QuizCategory, CATEGORY_LABELS, Question, Answer } from "@/types/quiz.type";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export default function EditQuizPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<QuizCategory>(QuizCategory.KHAC);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const quizStore = useQuizStore();
  const questionStore = useQuestionStore();
  const answerStore = useAnswerStore();

  const [questions, setQuestions] = useState<Question[]>([]);

  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeQuestion, setActiveQuestion] = useState("");

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
          imageUrl: q.imageUrl,
          imageId: q.imageId,
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveQuestion(entry.target.id);
          }
        });
      },
      { threshold: 0.4 }
    );

    questions.forEach((q) => {
      const el = questionRefs.current[q.id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [questions]);

  const scrollToQuestion = (id: string) => {
    questionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

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

  const updateQuestion = (
    id: string,
    field: keyof Question,
    value: any
  ) => {
    // 🔥 Nếu sửa timeLimit của câu đầu tiên
    // thì apply cho toàn bộ câu hỏi
    if (field === "timeLimit" && questions[0]?.id === id) {
      setQuestions((prev) =>
        prev.map((q) => ({
          ...q,
          timeLimit: value,
        }))
      );

      return;
    }

    // 🔥 Các trường hợp khác → update riêng
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, [field]: value } : q
      )
    );
  };

  const addAnswer = (questionId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
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
    setQuestions((prev) =>
      prev.map((q) => {
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
    setQuestions((prev) =>
      prev.map((q) => {
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
      const emptyAnswerIndex = questions[i].answers.findIndex(
        (a) => !a.content.trim()
      );

      if (emptyAnswerIndex !== -1) {
        toast.error(
          `Câu hỏi ${i + 1} đang thiếu nội dung đáp án ${emptyAnswerIndex + 1}!`
        );
        return;
      }
    }

    setSaving(true);
    try {
      await quizStore.update(quizId, { title, category });
      const currentQuizData = await quizService.getById(quizId);

      if (currentQuizData.questions && currentQuizData.questions.length > 0) {
        // Xóa các câu hỏi đã bị người dùng xóa khỏi danh sách
        const currentQuestionIds = questions.map(q => q.id);
        for (const oldQ of currentQuizData.questions) {
          if (!currentQuestionIds.includes(oldQ.id)) {
            await questionStore.delete(oldQ.id);
          }
        }
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        let questionId = q.id;

        if (q.id.startsWith("q-")) {
          // Tạo câu hỏi mới
          const newQuestion = await questionStore.create({
            quizId,
            content: q.content,
            timeLimit: q.timeLimit,
            orderIndex: i,
            imageUrl: q.imageUrl,
            imageId: q.imageId
          });
          questionId = newQuestion.id;
        } else {
          // Cập nhật câu hỏi hiện có
          await questionStore.update(questionId, {
            content: q.content,
            timeLimit: q.timeLimit,
            orderIndex: i,
            imageUrl: q.imageUrl,
            imageId: q.imageId
          });

          // Xóa các đáp án đã bị người dùng xóa khỏi câu hỏi này
          const oldQ = currentQuizData.questions.find((old: any) => old.id === questionId);
          if (oldQ && oldQ.answers) {
            const currentAnswerIds = q.answers.map((a: any) => a.id);
            for (const oldA of oldQ.answers) {
              if (!currentAnswerIds.includes(oldA.id)) {
                await answerStore.delete(oldA.id);
              }
            }
          }
        }

        // 🔥 Nếu có file mới đang chờ -> upload ngay sau khi có ID câu hỏi
        if (q.pendingFile) {
          await questionStore.uploadImage(questionId, q.pendingFile);
        }

        for (const a of q.answers) {
          if (a.id.startsWith("a-") || a.id.startsWith("a1-") || a.id.startsWith("a2-")) {
            await answerStore.create({
              questionId,
              content: a.content,
              isCorrect: a.isCorrect
            });
          } else {
            await answerStore.update(a.id, {
              content: a.content,
              isCorrect: a.isCorrect
            });
          }
        }
      }

      toast.success("Cập nhật bộ Quiz thành công!");
      router.push("/quiz");
    } catch (error) {
      toast.error("Có lỗi xảy ra khi lưu thay đổi");
      console.error(error);
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
    <>
      {/* APP BAR STICKY */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
                onClick={() => router.push('/quiz')}
              className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-black tracking-tight">Chỉnh sửa Quiz</h1>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden border-2 rounded-xl"
            onClick={() => setShowMobileSidebar(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* MOBILE SIDEBAR OVERLAY */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMobileSidebar(false)}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 bottom-0 w-[320px] max-w-[85vw] bg-background shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-black text-lg">Menu</h2>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setShowMobileSidebar(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* QUIZ SUMMARY */}
              <Card className="rounded-3xl border-2 shrink-0">
                <CardContent className="p-5 space-y-4">
                  <div>
                    <h2 className="text-2xl font-black">
                      {title || "Quiz chưa có tên"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {questions.length} câu hỏi
                    </p>
                  </div>
                  <Button
                    className="w-full rounded-2xl h-12 font-black"
                    onClick={() => { handleUpdate(); setShowMobileSidebar(false); }}
                    disabled={saving}
                  >
                    {saving ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </CardContent>
              </Card>

              {/* QUESTION NAV */}
              <Card className="rounded-3xl border-2">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    {questions.map((q, index) => {
                      const isActive = activeQuestion === q.id;
                      return (
                        <button
                          key={q.id}
                          onClick={() => {
                            scrollToQuestion(q.id);
                            setShowMobileSidebar(false);
                          }}
                          className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted border-transparent"
                            }`}
                        >
                          <div className="font-black">Câu {index + 1}</div>
                          <div className="text-xs opacity-70 line-clamp-2 mt-1">
                            {q.content || "Chưa có nội dung"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* LEFT CONTENT */}
        <div className="flex-1 min-w-0 space-y-12 pb-32">
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
                      className="text-2xl font-black py-8 border-2 border-transparent bg-white focus:border-primary/50 transition-all rounded-2xl"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="category" className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                      Danh mục
                    </Label>
                    <Select value={category} onValueChange={(value) => setCategory(value as QuizCategory)}>
                      <SelectTrigger className="text-xl font-black py-8 border-2 border-transparent bg-white focus:border-primary/50 transition-all rounded-2xl h-8">
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
          <section className="space-y-8">
            {questions.map((q, index) => (
              <div
                key={q.id}
                id={q.id}
                ref={(el) => {
                  questionRefs.current[q.id] = el;
                }}
              >
                <QuestionCard
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
              </div>
            ))}
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

        {/* RIGHT NAVBAR */}
        <div className="hidden lg:flex flex-col sticky top-24 space-y-4 self-start max-h-[calc(100vh-8rem)]">
          {/* QUIZ SUMMARY */}
          <Card className="rounded-3xl border-2 shrink-0">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-2xl font-black">
                  {title || "Quiz chưa có tên"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {questions.length} câu hỏi
                </p>
              </div>
              <Button
                className="w-full rounded-2xl h-12 font-black"
                onClick={handleUpdate}
                disabled={saving}
              >
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </CardContent>
          </Card>

          {/* QUESTION NAV */}
          {questions.length > 0 && (
            <Card className="rounded-3xl border-2 flex-1 min-h-0 flex flex-col">
              <CardContent className="p-4 overflow-y-auto flex-1 min-h-0">
                <div className="space-y-2">
                  {questions.map((q, index) => {
                    const isActive = activeQuestion === q.id;
                    return (
                      <button
                        key={q.id}
                        onClick={() => scrollToQuestion(q.id)}
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted border-transparent"
                          }`}
                      >
                        <div className="font-black">Câu {index + 1}</div>
                        <div className="text-xs opacity-70 line-clamp-2 mt-1">
                          {q.content || "Chưa có nội dung"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
