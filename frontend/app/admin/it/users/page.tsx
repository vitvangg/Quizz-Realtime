"use client";

import { useEffect, useState } from "react";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Edit2, Ban, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UserFormDialog } from "@/components/admin/user-form-dialog";

// Dummy data cho tới khi tích hợp với Backend API
const mockUsers = [
  { id: "1", email: "admin@quizz.com", role: "Admin", status: "ACTIVE", createdAt: "2024-01-01" },
  { id: "2", email: "player1@gmail.com", role: "User", status: "ACTIVE", createdAt: "2024-01-02" },
  { id: "3", email: "spammer@gmail.com", role: "User", status: "BANNED", createdAt: "2024-01-05" },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState(mockUsers);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  useEffect(() => {
    // Tương lai: fetch users từ backend
    // fetchUsers();
  }, []);

  const handleCreateNew = () => {
    setSelectedUser(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: any) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý User</h1>
          <p className="text-muted-foreground">
            Xem, thêm, sửa, xóa và khóa tài khoản người dùng
          </p>
        </div>
        <Button className="gap-2" onClick={handleCreateNew}>
          <PlusCircle className="h-4 w-4" />
          Thêm User
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm theo email..."
            className="pl-8"
          />
        </div>
        {/* Có thể thêm Filter (Role, Status) bằng Select ở đây */}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò (Role)</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    user.status === 'ACTIVE' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {user.status === 'ACTIVE' ? 'Hoạt động' : 'Bị khóa'}
                  </span>
                </TableCell>
                <TableCell>{user.createdAt}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="icon" title="Chỉnh sửa" onClick={() => handleEdit(user)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  {user.status === 'ACTIVE' ? (
                    <Button variant="outline" size="icon" title="Khóa tài khoản" className="text-red-500 hover:text-red-600">
                      <Ban className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="outline" size="icon" title="Mở khóa tài khoản" className="text-green-500 hover:text-green-600">
                      <PlayCircle className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <UserFormDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        user={selectedUser} 
      />
    </div>
  );
}

