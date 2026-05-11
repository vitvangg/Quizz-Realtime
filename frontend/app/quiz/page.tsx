"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuizStore } from "@/stores/quiz.store";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Play, Edit, Trash2, BookOpen, Clock, LogOut } from "lucide-react";
import Link from "next/link";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function MyQuizzesPage() {
  const router = useRouter();
  const { quizzes, loading, getMyQuizzes, delete: deleteQuiz } = useQuizStore();
  const { createRoom, loading: roomLoading, currentRoom, reset } = useRoomStore();
  const { user } = useAuthStore();

  useEffect(() => {
    getMyQuizzes();
    return () => {
      reset();
    };
  }, [getMyQuizzes, reset]);

  useEffect(() => {
    if (currentRoom) {
      // Host: redirect with host flag
      router.push(`/room/${currentRoom.id}?host=true`);
    }
  }, [currentRoom, router]);

  const handleDelete = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa bộ câu hỏi này không?")) {
      await deleteQuiz(id);
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
          {user && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{user.email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1" />
                Đăng xuất
              </Button>
            </div>
          )}
          <Link href="/quiz/build">
            <Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform px-6 py-6 text-lg rounded-xl">
              <PlusCircle className="h-5 w-5" />
              Tạo Quiz mới
            </Button>
          </Link>
        </div>
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
          <Link href="/quiz/build">
            <Button variant="outline" className="border-2 border-primary/20 hover:bg-primary/5">
              Tạo Quiz ngay bây giờ
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quizzes.map((quiz) => (
            <Card 
              key={quiz.id} 
              className="group relative overflow-hidden border-2 hover:border-primary/40 transition-all hover:shadow-xl hover:shadow-primary/5 flex flex-col cursor-pointer"
              onClick={() => router.push(`/quiz/edit/${quiz.id}`)}
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
                      handleDelete(quiz.id);
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

              <CardFooter className="pt-2 pb-6 px-6 grid grid-cols-2 gap-3">
                <Button variant="outline" className="w-full gap-2 rounded-lg" onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/quiz/edit/${quiz.id}`);
                }}>
                  <Edit className="h-4 w-4" /> Sửa
                </Button>
                <Button 
                  className="w-full gap-2 rounded-lg shadow-md shadow-primary/20 bg-primary hover:bg-primary/90"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame(quiz.id);
                  }}
                  disabled={roomLoading || !quiz.questions?.length}
                >
                  <Play className="h-4 w-4 fill-current" /> 
                  {roomLoading ? 'Đang tạo...' : 'Bắt đầu'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
