"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuizStore } from "@/stores/quiz.store";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  PlusCircle,
  BookOpen,
  AlertTriangle,
  Search,
  Calculator,
  Atom,
  FlaskConical,
  Leaf,
  PenTool,
  History,
  Globe,
  Languages,
  Cpu,
  HelpCircle,
  SortAsc,
  SortDesc,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { QuizCard } from "@/components/quiz/quiz-card";
import { Input } from "@/components/ui/input";
import { QuizCategory, CATEGORY_LABELS } from "@/types/quiz.type";
import { usePagination } from "@/hooks/usePagination";
import { QuizPagination } from "@/components/quiz/QuizPagination";
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

const CATEGORY_ICONS: Record<string, any> = {
  [QuizCategory.TOAN]: Calculator,
  [QuizCategory.VAT_LI]: Atom,
  [QuizCategory.HOA_HOC]: FlaskConical,
  [QuizCategory.SINH_HOC]: Leaf,
  [QuizCategory.VAN_HOC]: PenTool,
  [QuizCategory.LICH_SU]: History,
  [QuizCategory.DIA_LY]: Globe,
  [QuizCategory.TIENG_ANH]: Languages,
  [QuizCategory.CONG_NGHE]: Cpu,
  [QuizCategory.KHAC]: HelpCircle,
};

export default function MyQuizzesPage() {
  const router = useRouter();
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const {
    quizzes,
    loading,
    delete: deleteQuiz,
    search,
    searchKeyword,
    selectedCategory,
    setFilters,
    sortOrder,
    setSortOrder
  } = useQuizStore();

  const sortedQuizzes = useMemo(() => {
    return [...quizzes].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
  }, [quizzes, sortOrder]);

  const {
    page,
    totalPages,
    totalItems,
    paginatedItems,
    startIndex,
    endIndex,
    nextPage,
    prevPage,
    setPage,
    resetPage
  } = usePagination(sortedQuizzes, { pageSize: 6 });

  const { createRoom, loading: roomLoading, currentRoom, reset } = useRoomStore();
  const { user } = useAuthStore();

  const quizToDeleteId = useQuizStore((state) => state.currentQuiz?.id || null);
  const setQuizToDeleteId = (id: string | null) => {
    useQuizStore.setState({ currentQuiz: id ? { id } : null });
  };

  const isDeleting = loading && !!quizToDeleteId;

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = selectedCategory !== "ALL" ? selectedCategory : searchKeyword;
      search(query);
      resetPage(); // Reset to page 1 when searching or filtering
    }, 400);

    return () => clearTimeout(timer);
  }, [searchKeyword, selectedCategory, search, resetPage]);

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
    setQuizToDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (!quizToDeleteId) return;
    try {
      await deleteQuiz(quizToDeleteId);
      setQuizToDeleteId(null);
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
      setActiveQuizId(quizId);
      await createRoom(quizId);
    } catch (error) {
      toast.error("Không thể tạo phòng");
    } finally {
      setActiveQuizId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header Banner */}
      <div className="bg-neon-yellow border-b-4 border-black">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tight mb-2">BỘ SƯU TẬP</h1>
              <p className="font-bold text-black/70">Quản lý và tổ chức các bộ câu hỏi của bạn</p>
            </div>
            <Link href="/quiz/builder">
              <Button className="gap-2 bg-[#ff6b9d] text-white border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all px-8 py-6 text-lg font-black rounded-xl">
                <PlusCircle className="h-6 w-6" />
                TẠO QUIZ MỚI
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Search & Filter - Optimized for edge-to-edge alignment */}
        <div className="flex flex-col lg:flex-row items-center gap-6 mb-12 w-full">
          {/* Search Input - Expands to fill available space */}
          <div className="relative flex-grow w-full lg:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/50" />
            <Input
              placeholder="Tìm kiếm bộ câu hỏi theo tên..."
              className="pl-12 h-14 rounded-xl border-4 border-black bg-neon-yellow/10 font-bold text-lg focus:border-neon-pink focus:bg-white transition-all shadow-brutal-sm focus:shadow-none"
              value={searchKeyword}
              onChange={(e) => setFilters(e.target.value, selectedCategory)}
            />
          </div>

          {/* Category Filter - Fixed width */}
          <div className="w-full sm:w-1/2 lg:w-64 shrink-0">
            <Select
              value={selectedCategory}
              onValueChange={(val) => setFilters(searchKeyword, val)}
            >
              <SelectTrigger className="w-full h-14 rounded-xl border-4 border-black font-black text-lg bg-white shadow-brutal-sm hover:shadow-none">
                <SelectValue placeholder="Danh mục" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-4 border-black">
                <SelectItem value="ALL" className="font-black py-3 uppercase">
                  Tất cả danh mục
                </SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => {
                  const Icon = CATEGORY_ICONS[value as QuizCategory] || HelpCircle;
                  return (
                    <SelectItem key={value} value={value} className="font-bold py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Sort Order - Fixed width, aligned to the right edge */}
          <div className="w-full sm:w-1/2 lg:w-52 shrink-0">
            <Select
              value={sortOrder}
              onValueChange={(val: "newest" | "oldest") => setSortOrder(val)}
            >
              <SelectTrigger className="w-full h-14 rounded-xl border-4 border-black font-black text-lg bg-white shadow-brutal-sm hover:shadow-none">
                <div className="flex items-center gap-2">
                  {sortOrder === "newest" ? <SortDesc className="h-5 w-5" /> : <SortAsc className="h-5 w-5" />}
                  <SelectValue placeholder="Sắp xếp" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-4 border-black">
                <SelectItem value="newest" className="font-bold py-3">
                  Mới nhất
                </SelectItem>
                <SelectItem value="oldest" className="font-bold py-3">
                  Cũ nhất
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading State */}
        {loading && quizzes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin bg-neon-pink"></div>
            <p className="font-black uppercase tracking-widest animate-pulse">Đang tải danh sách...</p>
          </div>
        ) : quizzes.length === 0 ? (
          /* Empty State */
          <Card className="border-4 border-dashed border-black py-24 flex flex-col items-center justify-center text-center rounded-2xl bg-neon-blue/10">
            <div className="bg-neon-yellow border-4 border-black shadow-brutal p-8 mb-6">
              <BookOpen className="h-16 w-16 text-black" />
            </div>
            <CardTitle className="text-3xl font-black mb-2 uppercase">TRỐNG RỖNG</CardTitle>
            <p className="max-w-sm mb-10 font-medium text-black/70">
              Bắt đầu tạo bộ câu hỏi đầu tiên để chia sẻ kiến thức!
            </p>
            <Link href="/quiz/builder">
              <Button className="bg-black text-white border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1 font-black text-lg px-8 py-6 rounded-xl">
                TẠO QUIZ NGAY
              </Button>
            </Link>
          </Card>
        ) : (
          /* Quiz Grid */
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedItems.map((quiz) => (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  roomLoading={roomLoading && activeQuizId === quiz.id}
                  onDelete={handleDeleteClick}
                  onStartGame={handleStartGame}
                />
              ))}
            </div>

            <QuizPagination
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPrev={prevPage}
              onNext={nextPage}
              onPageChange={setPage}
            />
          </>
        )}

        {/* Delete Dialog */}
        <Dialog open={!!quizToDeleteId} onOpenChange={(open) => !open && setQuizToDeleteId(null)}>
          <DialogContent className="sm:max-w-md border-4 border-black shadow-brutal-xl rounded-xl">
            <DialogHeader className="flex flex-col items-center pt-4">
              <div className="bg-white border-4 border-black shadow-brutal p-5 mb-4">
                <AlertTriangle className="h-14 w-14 text-red-500" />
              </div>
              <DialogTitle className="text-2xl font-black text-center uppercase">XÁC NHẬN XÓA?</DialogTitle>
              <DialogDescription className="text-center text-base font-medium">
                Hành động này không thể hoàn tác. Dữ liệu sẽ bị mất vĩnh viễn.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-4 mt-6 sm:justify-center p-2">
              <Button
                variant="outline"
                onClick={() => setQuizToDeleteId(null)}
                className="flex-1 rounded-xl h-14 font-black border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
                disabled={isDeleting}
              >
                HỦY
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                className="flex-1 rounded-xl h-14 font-black border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-red-500"
                disabled={isDeleting}
              >
                {isDeleting ? "ĐANG XÓA..." : "XÓA NGAY"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
