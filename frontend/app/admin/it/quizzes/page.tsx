"use client";

import { useEffect, useState } from "react";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Edit2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";

import { useQuizStore } from "@/stores/quiz.store";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminQuizzesPage() {
  const { quizzes, loading, getAll, adminDelete } = useQuizStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    getAll();
  }, [getAll]);

  const handleDelete = async (id: string) => {
    await adminDelete(id);
    setDeleteConfirmId(null);
  };

   const formatDate = (dateString: string) => {
        try {
          return new Intl.DateTimeFormat('vi-VN', {
           day: '2-digit',
            month: '2-digit',
            year: 'numeric',
           hour: '2-digit',
           minute: '2-digit'
        }).format(new Date(dateString));
        } catch (e) {
           return dateString;
         }
       };
  const filteredQuizzes = quizzes.filter(quiz => 
    quiz.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (quiz.user?.fullName && quiz.user.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (quiz.user?.email && quiz.user.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Quiz</h1>
          <p className="text-muted-foreground">
            Tạo và quản lý các bộ câu hỏi trắc nghiệm
          </p>
        </div>
    
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm quiz theo tiêu đề hoặc người tạo..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên bộ câu hỏi</TableHead>
              <TableHead>Thể loại</TableHead>
              <TableHead>Số lượng câu</TableHead>
              <TableHead>Người tạo</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">Đang tải...</TableCell>
              </TableRow>
            ) : filteredQuizzes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">Không tìm thấy quiz nào</TableCell>
              </TableRow>
            ) : (
              filteredQuizzes.map((quiz) => (
                <TableRow key={quiz.id}>
                  <TableCell className="font-medium">{quiz.title}</TableCell>
                  <TableCell>{quiz.category}</TableCell>
                  <TableCell>{quiz.questions?.length || 0}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{quiz.user?.fullName || "N/A"}</div>
                      <div className="text-xs text-muted-foreground">{quiz.user?.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(quiz.createdAt)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Link href={`/quiz/edit/${quiz.id}`}>
                      <Button variant="outline" size="icon" title="Chỉnh sửa">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </Link>

                    <Dialog open={deleteConfirmId === quiz.id} onOpenChange={(open) => setDeleteConfirmId(open ? quiz.id : null)}>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        title="Xóa" 
                        className="text-red-500 hover:text-red-600"
                        onClick={() => setDeleteConfirmId(quiz.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Xác nhận xóa?</DialogTitle>
                          <DialogDescription>
                            Hành động này sẽ thực hiện xóa mềm bộ câu hỏi <b>{quiz.title}</b>. Người chơi sẽ không thể tham gia các phòng sử dụng bộ câu hỏi này nữa.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Hủy</Button>
                          <Button 
                            onClick={() => handleDelete(quiz.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Xóa
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
