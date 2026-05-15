"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Edit,
  Play,
  Trash2,
  Tag,
  Calculator,
  Atom,
  FlaskConical,
  Leaf,
  PenTool,
  History,
  Globe,
  Languages,
  Cpu,
  HelpCircle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, QuizCategory } from "@/types/quiz.type";
import { Badge } from "@/components/ui/badge";

interface QuizCardProps {
  quiz: any;
  roomLoading: boolean;
  onDelete: (id: string) => void;
  onStartGame: (quizId: string) => void;
}

// Neo-Brutalism color themes
const CATEGORY_THEMES: Record<string, {
  bg: string;
  text: string;
  border: string;
  icon: any;
}> = {
  [QuizCategory.TOAN]: {
    bg: "bg-blue-500",
    text: "text-white",
    border: "border-blue-600",
    icon: Calculator,
  },
  [QuizCategory.VAT_LI]: {
    bg: "bg-purple-500",
    text: "text-white",
    border: "border-purple-600",
    icon: Atom,
  },
  [QuizCategory.HOA_HOC]: {
    bg: "bg-emerald-500",
    text: "text-white",
    border: "border-emerald-600",
    icon: FlaskConical,
  },
  [QuizCategory.SINH_HOC]: {
    bg: "bg-lime-500",
    text: "text-black",
    border: "border-lime-600",
    icon: Leaf,
  },
  [QuizCategory.VAN_HOC]: {
    bg: "bg-amber-500",
    text: "text-black",
    border: "border-amber-600",
    icon: PenTool,
  },
  [QuizCategory.LICH_SU]: {
    bg: "bg-stone-600",
    text: "text-white",
    border: "border-stone-700",
    icon: History,
  },
  [QuizCategory.DIA_LY]: {
    bg: "bg-sky-500",
    text: "text-white",
    border: "border-sky-600",
    icon: Globe,
  },
  [QuizCategory.TIENG_ANH]: {
    bg: "bg-rose-500",
    text: "text-white",
    border: "border-rose-600",
    icon: Languages,
  },
  [QuizCategory.CONG_NGHE]: {
    bg: "bg-slate-700",
    text: "text-white",
    border: "border-slate-800",
    icon: Cpu,
  },
  [QuizCategory.KHAC]: {
    bg: "bg-gray-500",
    text: "text-white",
    border: "border-gray-600",
    icon: HelpCircle,
  },
};

export function QuizCard({ quiz, roomLoading, onDelete, onStartGame }: QuizCardProps) {
  const router = useRouter();
  const theme = CATEGORY_THEMES[quiz.category as QuizCategory] || CATEGORY_THEMES[QuizCategory.KHAC];
  const CategoryIcon = theme.icon;

  return (
    <Card
      className="group relative overflow-hidden border-4 border-black shadow-brutal transition-all duration-200 hover:-translate-y-1 hover:shadow-brutal-lg cursor-pointer bg-white"
      onClick={() => router.push(`/quiz/watch/${quiz.id}`)}
    >
      {/* Color Banner */}
      <div className={`${theme.bg} ${theme.text} px-4 py-3 flex items-center justify-between border-b-4 border-black`}>
        <div className="flex items-center gap-2">
          <div className="bg-white border-2 border-black p-1.5 shadow-brutal-sm">
            <CategoryIcon className="h-5 w-5" />
          </div>
          <span className="font-black uppercase tracking-wide text-sm">{CATEGORY_LABELS[quiz.category as keyof typeof CATEGORY_LABELS] || "Khác"}</span>
        </div>
        <Badge variant="outline" className="bg-white border-2 border-black font-bold text-xs">
          {new Date(quiz.createdAt).toLocaleDateString('vi-VN')}
        </Badge>
      </div>

      {/* Card Body */}
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-xl font-black line-clamp-2 leading-tight group-hover:text-primary transition-colors">
            {quiz.title}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg bg-red-500 text-white border-2 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(quiz.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 flex-grow">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-neon-yellow border-4 border-black p-4 text-center shadow-brutal-sm">
            <p className="text-3xl font-black text-black">{quiz.questions?.length || 0}</p>
            <p className="text-xs font-bold uppercase text-black/70">Câu hỏi</p>
          </div>
          <div className="bg-neon-pink border-4 border-black p-4 text-center shadow-brutal-sm">
            <p className="text-3xl font-black text-white">{quiz.questions?.reduce((acc: number, q: any) => acc + q.timeLimit, 0) || 0}s</p>
            <p className="text-xs font-bold uppercase text-white/70">Thời gian</p>
          </div>
        </div>
      </CardContent>

      <CardFooter
        className="pt-2 pb-6 px-6 grid grid-cols-2 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl font-bold border-2 hover:bg-muted"
          onClick={() => {
            router.push(`/quiz/edit/${quiz.id}`);
          }}
        >
          <Edit className="h-4 w-4" /> Sửa
        </Button>
        <Button
          className="flex-1 gap-2 font-black bg-neon-green border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          onClick={() => onStartGame(quiz.id)}
          disabled={roomLoading || !quiz.questions?.length}
        >
          <Play className="h-4 w-4" />
          {roomLoading ? '...' : 'CHƠI'}
        </Button>
      </CardFooter>
    </Card>
  );
}
