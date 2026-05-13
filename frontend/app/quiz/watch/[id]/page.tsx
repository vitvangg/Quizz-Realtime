"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, 
  LayoutGrid, 
  Eye,
  Info,
  FileText 
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { QuestionCard } from "@/components/quiz/question-card";
import { quizService } from "@/services/quiz.service";
import { CATEGORY_LABELS } from "@/types/quiz.type";

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

export default function WatchQuizPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);

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
              Chi tiết Quiz
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <Eye className="h-3 w-3" /> Chế độ chỉ xem
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href={`/quiz/edit/${quizId}`}>
            <Button
              className="gap-2 px-8 py-6 rounded-2xl shadow-xl shadow-primary/20 font-black text-lg transition-all hover:scale-105"
            >
              Chỉnh sửa ngay
            </Button>
          </Link>
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
      <section className="space-y-10">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-primary">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">Danh sách câu hỏi ({questions.length})</span>
          </div>
        </div>

        <div className="space-y-8">
          {questions.length > 0 ? (
            questions.map((q, index) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={index}
                totalQuestions={questions.length}
                readOnly={true}
              />
            ))
          ) : (
            <div className="text-center py-20 border-2 border-dashed rounded-3xl bg-muted/20">
              <p className="text-muted-foreground font-bold">Bộ Quiz này chưa có câu hỏi nào.</p>
            </div>
          )}
        </div>
      </section>

      {/* FOOTER INFO */}
      <div className="flex justify-center pt-8">
        <div className="bg-muted px-8 py-4 rounded-2xl font-black text-primary border-2 border-primary/10">
          TỔNG SỐ: {questions.length} CÂU HỎI
        </div>
      </div>
    </div>
  );
}