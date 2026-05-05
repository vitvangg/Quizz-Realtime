"use client";

import { useEffect, useState } from "react";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Edit2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";

// Dummy data cho tới khi tích hợp với Backend API
const mockQuizzes = [
  { id: "1", title: "Lịch sử Việt Nam", questionsCount: 15, author: "admin@quizz.com", createdAt: "2024-02-01" },
  { id: "2", title: "Toán học lớp 5", questionsCount: 10, author: "teacher1@gmail.com", createdAt: "2024-02-03" },
  { id: "3", title: "IT Kiến thức cơ bản", questionsCount: 20, author: "admin@quizz.com", createdAt: "2024-02-05" },
];

export default function AdminQuizzesPage() {
  const [quizzes, setQuizzes] = useState(mockQuizzes);

  useEffect(() => {
    // Tương lai: fetch quizzes từ backend
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Quiz</h1>
          <p className="text-muted-foreground">
            Tạo và quản lý các bộ câu hỏi trắc nghiệm
          </p>
        </div>
        <Link href="/admin/quizzes/builder">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Tạo Quiz mới
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm quiz..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên bộ câu hỏi</TableHead>
              <TableHead>Số lượng câu</TableHead>
              <TableHead>Người tạo</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quizzes.map((quiz) => (
              <TableRow key={quiz.id}>
                <TableCell className="font-medium">{quiz.title}</TableCell>
                <TableCell>{quiz.questionsCount}</TableCell>
                <TableCell>{quiz.author}</TableCell>
                <TableCell>{quiz.createdAt}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Link href={`/admin/quizzes/builder?id=${quiz.id}`}>
                    <Button variant="outline" size="icon" title="Chỉnh sửa">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button variant="outline" size="icon" title="Xóa" className="text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
