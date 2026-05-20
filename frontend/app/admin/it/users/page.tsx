"use client";

import { useEffect, useState } from "react";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Edit2, Ban, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UserFormDialog } from "@/components/admin/user-form-dialog";

import { useUserStore } from "@/stores/user.store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

export default function AdminUsersPage() {
  const { users, loading, fetchUsers, updateUser, deleteUser } = useUserStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateNew = () => {
    setSelectedUser(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: any) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const handleToggleStatus = async (user: any) => {
    const newStatus = user.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    await updateUser(user.id, { status: newStatus, fullName: user.fullName || "" });
  };

  const handleDelete = async (id: string) => {
    await deleteUser(id);
    setDeleteConfirmId(null);
  };

  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat('vi-VN').format(new Date(dateString));
    } catch (e) {
      return dateString;
    }
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.fullName && user.fullName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
            placeholder="Tìm kiếm theo email hoặc tên..."
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
              <TableHead>Họ tên</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò (Role)</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">Đang tải...</TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">Không tìm thấy người dùng nào</TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName || "N/A"}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role?.name || "User"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      user.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      {user.status === 'ACTIVE' ? 'Hoạt động' : 'Bị khóa'}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="icon" title="Chỉnh sửa" onClick={() => handleEdit(user)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      title={user.status === 'ACTIVE' ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      className={user.status === 'ACTIVE' ? "text-red-500 hover:text-red-600" : "text-green-500 hover:text-green-600"}
                      onClick={() => handleToggleStatus(user)}
                    >
                      {user.status === 'ACTIVE' ? <Ban className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                    </Button>
                    
                    <Dialog open={deleteConfirmId === user.id} onOpenChange={(open) => setDeleteConfirmId(open ? user.id : null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon" title="Xóa" className="text-red-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Xác nhận xóa?</DialogTitle>
                          <DialogDescription>
                            Hành động này không thể hoàn tác. Người dùng <b>{user.email}</b> sẽ bị xóa vĩnh viễn khỏi hệ thống.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Hủy</Button>
                          <Button 
                            onClick={() => handleDelete(user.id)}
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
      
      <UserFormDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        user={selectedUser} 
      />
    </div>
  );
}

