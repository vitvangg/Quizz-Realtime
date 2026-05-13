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

const CATEGORY_THEMES: Record<string, {
  color: string;
  bg: string;
  gradient: string;
  border: string;
  icon: any;
  shadow: string;
}> = {
  [QuizCategory.TOAN]: {
    color: "text-blue-600",
    bg: "bg-blue-50",
    gradient: "from-blue-500/20 to-cyan-500/20",
    border: "group-hover:border-blue-400",
    shadow: "hover:shadow-blue-500/10",
    icon: Calculator,
  },
  [QuizCategory.VAT_LI]: {
    color: "text-purple-600",
    bg: "bg-purple-50",
    gradient: "from-purple-500/20 to-indigo-500/20",
    border: "group-hover:border-purple-400",
    shadow: "hover:shadow-purple-500/10",
    icon: Atom,
  },
  [QuizCategory.HOA_HOC]: {
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    gradient: "from-emerald-500/20 to-teal-500/20",
    border: "group-hover:border-emerald-400",
    shadow: "hover:shadow-emerald-500/10",
    icon: FlaskConical,
  },
  [QuizCategory.SINH_HOC]: {
    color: "text-lime-600",
    bg: "bg-lime-50",
    gradient: "from-lime-500/20 to-green-500/20",
    border: "group-hover:border-lime-400",
    shadow: "hover:shadow-lime-500/10",
    icon: Leaf,
  },
  [QuizCategory.VAN_HOC]: {
    color: "text-amber-600",
    bg: "bg-amber-50",
    gradient: "from-amber-500/20 to-orange-500/20",
    border: "group-hover:border-amber-400",
    shadow: "hover:shadow-amber-500/10",
    icon: PenTool,
  },
  [QuizCategory.LICH_SU]: {
    color: "text-stone-600",
    bg: "bg-stone-50",
    gradient: "from-stone-500/20 to-orange-700/10",
    border: "group-hover:border-stone-400",
    shadow: "hover:shadow-stone-500/10",
    icon: History,
  },
  [QuizCategory.DIA_LY]: {
    color: "text-sky-600",
    bg: "bg-sky-50",
    gradient: "from-sky-500/20 to-blue-500/20",
    border: "group-hover:border-sky-400",
    shadow: "hover:shadow-sky-500/10",
    icon: Globe,
  },
  [QuizCategory.TIENG_ANH]: {
    color: "text-rose-600",
    bg: "bg-rose-50",
    gradient: "from-rose-500/20 to-pink-500/20",
    border: "group-hover:border-rose-400",
    shadow: "hover:shadow-rose-500/10",
    icon: Languages,
  },
  [QuizCategory.CONG_NGHE]: {
    color: "text-slate-700",
    bg: "bg-slate-100",
    gradient: "from-slate-500/20 to-zinc-500/20",
    border: "group-hover:border-slate-400",
    shadow: "hover:shadow-slate-500/10",
    icon: Cpu,
  },
  [QuizCategory.KHAC]: {
    color: "text-gray-600",
    bg: "bg-gray-50",
    gradient: "from-gray-500/20 to-slate-500/20",
    border: "group-hover:border-gray-400",
    shadow: "hover:shadow-gray-500/10",
    icon: HelpCircle,
  },
};

export function QuizCard({ quiz, roomLoading, onDelete, onStartGame }: QuizCardProps) {
  const router = useRouter();
  const theme = CATEGORY_THEMES[quiz.category as QuizCategory] || CATEGORY_THEMES[QuizCategory.KHAC];
  const CategoryIcon = theme.icon;

  return (
    <Card
      className={`group relative overflow-hidden border-2 transition-all flex flex-col cursor-pointer ${theme.border} ${theme.shadow}`}
      onClick={() => router.push(`/quiz/watch/${quiz.id}`)}
    >
      <CardHeader className={`pb-4 relative bg-gradient-to-br ${theme.gradient}`}>
        <div className="flex justify-between items-start">
          <div className={`${theme.bg} ${theme.color} p-2.5 rounded-xl mb-2 shadow-sm`}>
            <CategoryIcon className="h-6 w-6" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors bg-background/50 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(quiz.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <CardTitle className="text-xl font-black line-clamp-1 group-hover:text-primary transition-colors">
          {quiz.title}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge variant="secondary" className={`${theme.bg} ${theme.color} border-none flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest`}>
            <Tag className="h-3 w-3" />
            {CATEGORY_LABELS[quiz.category as keyof typeof CATEGORY_LABELS] || "Khác"}
          </Badge>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold uppercase tracking-tighter bg-background/50 backdrop-blur-sm px-2 py-0.5 rounded-full">
            <Clock className="h-3 w-3" />
            {new Date(quiz.createdAt).toLocaleDateString('vi-VN')}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 flex-grow">
        <div className="flex items-center justify-between bg-muted/20 p-4 rounded-2xl border border-muted-foreground/5">
          <div className="text-center flex-1 border-r border-muted-foreground/10">
            <p className={`text-2xl font-black ${theme.color}`}>{quiz.questions?.length || 0}</p>
            <p className="text-[10px] uppercase font-black text-muted-foreground tracking-tighter">Câu hỏi</p>
          </div>
          <div className="text-center flex-1">
            <p className={`text-2xl font-black ${theme.color}`}>
              {quiz.questions?.reduce((acc: number, q: any) => acc + q.timeLimit, 0) || 0}s
            </p>
            <p className="text-[10px] uppercase font-black text-muted-foreground tracking-tighter">Thời gian</p>
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
          className={`w-full gap-2 rounded-xl font-black shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95`}
          onClick={() => {
            onStartGame(quiz.id);
          }}
          disabled={roomLoading || !quiz.questions?.length}
        >
          <Play className="h-4 w-4 fill-current" />
          {roomLoading ? '...' : 'Chơi'}
        </Button>
      </CardFooter>
    </Card>
  );
}