"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuizStore } from "@/stores/quiz.store";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PlusCircle, BookOpen, LogOut, AlertTriangle, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { QuizCard } from "@/components/quiz/quiz-card";
import { Input } from "@/components/ui/input";
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
  const { quizzes, loading, getMyQuizzes, delete: deleteQuiz, search } = useQuizStore();
  const { createRoom, loading: roomLoading, currentRoom, reset } = useRoomStore();
  const { user } = useAuthStore();

  const [quizToDelete, setQuizToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      search(keyword);
    }, 500);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  useEffect(() => {
    if (currentRoom) {
      // Host: redirect with host flag
      router.push(`/room/${currentRoom.id}?host=true`);
    }
  }, [currentRoom, router]);

  const handleDeleteClick = (id: string) => {
    setQuizToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!quizToDelete) return;

    setIsDeleting(true);
    try {
      await deleteQuiz(quizToDelete);
      setQuizToDelete(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeleting(false);
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

  const handleLogout = async () => {
    const { logout } = useAuthStore.getState();
    await logout();
    router.push("/");
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Bộ sưu tập của tôi</h1>
          <p className="text-muted-foreground italic">
            Quản lý và tổ chức các bộ câu hỏi của bạn một cách chuyên nghiệp.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/quiz/builder">
            <Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform px-6 py-6 text-lg rounded-xl">
              <PlusCircle className="h-5 w-5" />
              Tạo Quiz mới
            </Button>
          </Link>
        </div>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Tìm kiếm bộ câu hỏi theo tên..."
          className="pl-10 h-12 rounded-xl border-2 focus-visible:ring-primary shadow-sm"

          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-center py-20">
          <div className="col-span-full flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-muted-foreground font-medium">Đang tải danh sách Quiz...</p>
          </div>
        </div>
      ) : quizzes.length === 0 ? (
        <Card className="border-dashed border-2 bg-muted/5 py-16 flex flex-col items-center justify-center text-center">
          <div className="bg-primary/10 p-6 rounded-full mb-6">
            <BookOpen className="h-12 w-12 text-primary opacity-50" />
          </div>
          <CardTitle className="text-2xl mb-2">Chưa có bộ câu hỏi nào</CardTitle>
          <p className="text-muted-foreground max-w-sm mb-8">
            Bắt đầu tạo bộ câu hỏi đầu tiên của bạn để chia sẻ kiến thức với mọi người!
          </p>
          <Link href="/quiz/builder">
            <Button variant="outline" className="border-2 border-primary/20 hover:bg-primary/5">
              Tạo Quiz ngay bây giờ
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

      {/* Custom Delete Confirmation Dialog */}
      <Dialog open={!!quizToDelete} onOpenChange={(open) => !open && setQuizToDelete(null)}>
        <DialogContent className="sm:max-w-md border-2">
          <DialogHeader className="flex flex-col items-center pt-4">
            <div className="bg-destructive/10 p-4 rounded-full mb-2">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <DialogTitle className="text-2xl font-black text-center">Xác nhận xóa?</DialogTitle>
            <DialogDescription className="text-center text-base">
              Hành động này không thể hoàn tác. Toàn bộ dữ liệu câu hỏi và lịch sử phòng chơi liên quan sẽ bị ảnh hưởng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 mt-4 sm:justify-center">
            <Button
              variant="outline"
              onClick={() => setQuizToDelete(null)}
              className="flex-1 rounded-xl h-12 font-bold"
              disabled={isDeleting}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="flex-1 rounded-xl h-12 font-bold shadow-lg shadow-destructive/20"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang xóa...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Xóa vĩnh viễn
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
