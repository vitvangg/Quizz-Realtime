"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Info,
  FileText,
  Menu,
  X
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { QuestionCard } from "@/components/quiz/question-card";
import { quizService } from "@/services/quiz.service";
import { CATEGORY_LABELS, Question } from "@/types/quiz.type";



export default function WatchQuizPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeQuestion, setActiveQuestion] = useState("");

  const loadQuizData = useCallback(async () => {
    try {
      setLoading(true);
      const quiz = await quizService.getById(quizId);
      setTitle(quiz.title);
      setCategory(quiz.category);

      if (quiz.questions && quiz.questions.length > 0) {
        const formattedQuestions = quiz.questions.map((q: any) => ({
          id: q.id,
          content: q.content,
          imageUrl: q.imageUrl,
          imageId: q.imageId,
          timeLimit: q.timeLimit,
          answers: q.answers.map((a: any) => ({
            id: a.id,
            content: a.content,
            isCorrect: a.isCorrect
          }))
        }));
        setQuestions(formattedQuestions);
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
              onClick={() => router.back()}
              className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-black tracking-tight">Chi tiết Quiz</h1>
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
                  <Link href={`/quiz/edit/${quizId}`} onClick={() => setShowMobileSidebar(false)}>
                    <Button className="w-full rounded-2xl h-12 font-black">
                      Chỉnh sửa ngay
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* QUESTION NAV */}
              {questions.length > 0 && (
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
              )}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <p className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                      Tên bộ sưu tập
                    </p>
                    <p className="text-3xl font-black px-1">{title}</p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                      Danh mục
                    </p>
                    <p className="text-3xl font-black px-1">
                      {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || "Khác"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* QUESTIONS LIST */}
          <section className="space-y-8">
            {questions.length > 0 ? (
              questions.map((q, index) => (
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
                    readOnly={true}
                  />
                </div>
              ))
            ) : (
              <div className="text-center py-20 border-2 border-dashed rounded-3xl bg-muted/20">
                <p className="text-muted-foreground font-bold">Bộ Quiz này chưa có câu hỏi nào.</p>
              </div>
            )}
          </section>
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
              <Link href={`/quiz/edit/${quizId}`}>
                <Button className="w-full rounded-2xl h-12 font-black">
                  Chỉnh sửa ngay
                </Button>
              </Link>
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
