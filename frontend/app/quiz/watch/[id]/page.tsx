"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, LayoutGrid, Eye } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
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

export default function WatchQuizPage() {
    const router = useRouter();
    const params = useParams();
    const quizId = params.id as string;

    const [title, setTitle] = useState("");
    const [loading, setLoading] = useState(true);
    const [questions, setQuestions] = useState<Question[]>([]);

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
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground font-medium animate-pulse">Đang tải nội dung bộ Quiz...</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 pb-32">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-16 z-40 bg-background/80 backdrop-blur-md py-4 border-b">
              <div className="flex items-center gap-4">                    <Link href="/quiz">
                        <Button variant="outline" size="icon" className="rounded-full">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Xem chi tiết bộ Quiz</h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Chế độ chỉ xem, không thể chỉnh sửa
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/quiz/edit/${quizId}`}>
                        <Button className="gap-2 px-8 shadow-lg shadow-primary/20">
                            Chỉnh sửa ngay
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Quiz Info Card */}
            <Card className="border-2 border-primary/10 shadow-sm bg-muted/5">
                <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Tên bộ Quiz</h2>
                        <p className="text-2xl font-bold">{title}</p>
                    </div>
                </CardContent>
            </Card>

            {/* Questions List */}
            <div className="space-y-10">
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
                    <div className="text-center py-20 border-2 border-dashed rounded-3xl">
                        <p className="text-muted-foreground">Bộ Quiz này chưa có câu hỏi nào.</p>
                    </div>
                )}
            </div>

            {/* Footer Info */}
            <div className="flex justify-center pt-8">
                <p className="text-sm text-muted-foreground bg-muted px-4 py-2 rounded-full">
                    Tổng số: <strong>{questions.length}</strong> câu hỏi
                </p>
            </div>
        </div>
    );
}
