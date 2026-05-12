"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Clock, Edit, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface QuizCardProps {
  quiz: any;
  roomLoading: boolean;
  onDelete: (id: string) => void;
  onStartGame: (quizId: string) => void;
}

export function QuizCard({ quiz, roomLoading, onDelete, onStartGame }: QuizCardProps) {
  const router = useRouter();

  return (
    <Card
      className="group relative overflow-hidden border-2 hover:border-primary/40 transition-all hover:shadow-xl hover:shadow-primary/5 flex flex-col cursor-pointer"
      onClick={() => router.push(`/quiz/watch/${quiz.id}`)}
    >
      <CardHeader className="bg-muted/30 pb-4 relative">
        <div className="flex justify-between items-start">
          <div className="bg-primary/10 text-primary p-2 rounded-lg mb-2">
            <BookOpen className="h-5 w-5" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(quiz.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <CardTitle className="text-xl font-bold line-clamp-1">{quiz.title}</CardTitle>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-2">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(quiz.createdAt).toLocaleDateString('vi-VN')}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-6 flex-grow">
        <div className="flex items-center justify-between bg-muted/20 p-4 rounded-xl">
          <div className="text-center flex-1 border-r">
            <p className="text-2xl font-black text-primary">{quiz.questions?.length || 0}</p>
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Câu hỏi</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-2xl font-black text-primary">
              {quiz.questions?.reduce((acc: number, q: any) => acc + q.timeLimit, 0) || 0}s
            </p>
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Tổng thời gian</p>
          </div>
        </div>
      </CardContent>

      <CardFooter 
        className="pt-2 pb-6 px-6 grid grid-cols-2 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="outline" className="w-full gap-2 rounded-lg" onClick={() => {
          router.push(`/quiz/edit/${quiz.id}`);
        }}>
          <Edit className="h-4 w-4" /> Sửa
        </Button>
        <Button
          className="w-full gap-2 rounded-lg shadow-md shadow-primary/20 bg-primary hover:bg-primary/90"
          onClick={() => {
            onStartGame(quiz.id);
          }}
          disabled={roomLoading || !quiz.questions?.length}
        >
          <Play className="h-4 w-4 fill-current" />
          {roomLoading ? 'Đang tạo...' : 'Bắt đầu'}
        </Button>
      </CardFooter>
    </Card>
  );
}
