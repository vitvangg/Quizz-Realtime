"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuizStore } from "@/stores/quiz.store";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PlusCircle, BookOpen, AlertTriangle, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { QuizCard } from "@/components/quiz/quiz-card";
import { Input } from "@/components/ui/input";
import { QuizCategory, CATEGORY_LABELS } from "@/types/quiz.type";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function MyQuizzesPage() {
  const router = useRouter();
  const { 
    quizzes, 
    loading, 
    delete: deleteQuiz, 
    search, 
    searchKeyword, 
    selectedCategory, 
    setFilters 
  } = useQuizStore();
  
  const { createRoom, loading: roomLoading, currentRoom, reset } = useRoomStore();
  const { user } = useAuthStore();

  const quizToDelete = useQuizStore((state) => state.currentQuiz?.id || null);
  const setQuizToDelete = (id: string | null) => {
    useQuizStore.setState({ currentQuiz: id ? { id } : null });
  };
  
  const isDeleting = loading && !!quizToDelete;

  // Sync search logic
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = selectedCategory !== "ALL" ? selectedCategory : searchKeyword;
      search(query);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchKeyword, selectedCategory, search]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  useEffect(() => {
    if (currentRoom) {
      router.push(`/room/${currentRoom.id}?host=true`);
    }
  }, [currentRoom, router]);

  const handleDeleteClick = (id: string) => {
    setQuizToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!quizToDelete) return;
    try {
      await deleteQuiz(quizToDelete);
      setQuizToDelete(null);
    } catch (error) {
      console.error(error);
    }
  };

  const handleStartGame = async (quizId: string) => {
    if (!user) {
      toast.error("Vui lòng đăng nhập để tạo phòng");
      router.push("/signin");
      return;
    }
    try {
      await createRoom(quizId);
    } catch (error) {
      toast.error("Không thể tạo phòng");
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 uppercase tracking-tighter">
            Bộ sưu tập của tôi
          </h1>
          <p className="text-muted-foreground font-medium italic">
            Quản lý và tổ chức các bộ câu hỏi của bạn một cách chuyên nghiệp.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/quiz/builder">
            <Button className="gap-2 shadow-xl shadow-primary/20 hover:scale-105 transition-all px-8 py-7 text-lg rounded-2xl font-black">
              <PlusCircle className="h-6 w-6" />
              TẠO QUIZ MỚI
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-10">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm bộ câu hỏi..."
            className="pl-12 h-14 rounded-2xl border-2 focus-visible:ring-primary shadow-sm font-bold text-lg"
            value={searchKeyword}
            onChange={(e) => setFilters(e.target.value, selectedCategory)}
          />
        </div>
        <div className="w-full md:w-72">
          <Select 
            value={selectedCategory} 
            onValueChange={(val) => setFilters(searchKeyword, val)}
          >
            <SelectTrigger className="h-14 rounded-2xl border-2 focus:ring-primary shadow-sm font-black text-lg">
              <SelectValue placeholder="Danh mục" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-2">
              <SelectItem value="ALL" className="font-black py-3 uppercase">Tất cả danh mục</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value} className="font-bold py-3">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && quizzes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground font-black animate-pulse uppercase tracking-widest">Đang tải danh sách...</p>
        </div>
      ) : quizzes.length === 0 ? (
        <Card className="border-dashed border-4 bg-muted/5 py-24 flex flex-col items-center justify-center text-center rounded-3xl">
          <div className="bg-primary/10 p-8 rounded-full mb-6">
            <BookOpen className="h-16 w-16 text-primary opacity-50" />
          </div>
          <CardTitle className="text-3xl font-black mb-2 uppercase">Trống rỗng</CardTitle>
          <p className="text-muted-foreground max-w-sm mb-10 font-medium">
            Bắt đầu tạo bộ câu hỏi đầu tiên để chia sẻ kiến thức!
          </p>
          <Link href="/quiz/builder">
            <Button variant="outline" className="border-2 border-primary/20 hover:bg-primary/5 py-6 px-10 rounded-2xl font-black">
              TẠO QUIZ NGAY
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {quizzes.map((quiz) => (
            <QuizCard
              key={quiz.id}
              quiz={quiz}
              roomLoading={roomLoading}
              onDelete={handleDeleteClick}
              onStartGame={handleStartGame}
            />
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!quizToDelete} onOpenChange={(open) => !open && setQuizToDelete(null)}>
        <DialogContent className="sm:max-w-md border-2 rounded-3xl">
          <DialogHeader className="flex flex-col items-center pt-6">
            <div className="bg-destructive/10 p-5 rounded-full mb-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <DialogTitle className="text-2xl font-black text-center uppercase">Xác nhận xóa?</DialogTitle>
            <DialogDescription className="text-center text-base font-medium">
              Hành động này không thể hoàn tác. Dữ liệu sẽ bị mất vĩnh viễn.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-4 mt-6 sm:justify-center p-2">
            <Button
              variant="outline"
              onClick={() => setQuizToDelete(null)}
              className="flex-1 rounded-2xl h-14 font-black"
              disabled={isDeleting}
            >
              HỦY
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="flex-1 rounded-2xl h-14 font-black shadow-xl shadow-destructive/20"
              disabled={isDeleting}
            >
              {isDeleting ? "ĐANG XÓA..." : "XÓA NGAY"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}