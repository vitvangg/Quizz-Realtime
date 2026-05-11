"use client";

import { useEffect, useState } from "react";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Edit2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RoleFormDialog } from "@/components/admin/role-form-dialog";

// Dummy data cho tới khi tích hợp với Backend API
const mockRoles = [
  { 
    id: "1", 
    name: "Admin", 
    description: "Quản trị viên toàn quyền hệ thống", 
    permissions: ["1", "2", "3", "4", "5", "6"], // Tham chiếu đến MOCK_PERMISSIONS
    createdAt: "2024-01-01" 
  },
  { 
    id: "2", 
    name: "Moderator", 
    description: "Người kiểm duyệt nội dung, báo cáo", 
    permissions: ["2", "5"],
    createdAt: "2024-01-05" 
  },
  { 
    id: "3", 
    name: "User", 
    description: "Người chơi tiêu chuẩn", 
    permissions: [],
    createdAt: "2024-01-10" 
  },
];

export default function AdminRolesPage() {
  const [roles, setRoles] = useState(mockRoles);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);

  useEffect(() => {
    // Tương lai: fetch roles từ backend
    // fetchRoles();
  }, []);

  const handleCreateNew = () => {
    setSelectedRole(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (role: any) => {
    setSelectedRole(role);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Phân quyền (RBAC)</h1>
          <p className="text-muted-foreground">
            Quản lý các Vai trò (Role) và Quyền hạn (Permissions) trong hệ thống
          </p>
        </div>
        <Button className="gap-2" onClick={handleCreateNew}>
          <PlusCircle className="h-4 w-4" />
          Tạo Vai trò
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm vai trò..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên Role</TableHead>
              <TableHead>Mô tả</TableHead>
              <TableHead>Số lượng quyền</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">{role.name}</TableCell>
                <TableCell className="text-muted-foreground">{role.description || "—"}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    {role.permissions?.length || 0} quyền
                  </span>
                </TableCell>
                <TableCell>{role.createdAt}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="icon" title="Chỉnh sửa" onClick={() => handleEdit(role)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" title="Xóa" className="text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RoleFormDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        role={selectedRole} 
      />
    </div>
  );
}
