"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Permission {
  id: string;
  action: string;
  subject: string;
  description: string;
}

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: any; // Dữ liệu role nếu đang edit
}

// Dummy permissions cho tới khi có data từ API
const MOCK_PERMISSIONS: Permission[] = [
  { id: "1", action: "CREATE", subject: "USER", description: "Tạo người dùng mới" },
  { id: "2", action: "READ", subject: "USER", description: "Xem danh sách người dùng" },
  { id: "3", action: "UPDATE", subject: "USER", description: "Cập nhật người dùng" },
  { id: "4", action: "DELETE", subject: "USER", description: "Xóa người dùng" },
  { id: "5", action: "MANAGE", subject: "QUIZ", description: "Quản lý bài trắc nghiệm" },
  { id: "6", action: "MANAGE", subject: "SYSTEM", description: "Quản lý hệ thống" },
];

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>(MOCK_PERMISSIONS);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  
  const isEdit = !!role;

  useEffect(() => {
    if (open) {
      if (isEdit && role?.permissions) {
        // Assume role.permissions is an array of permission IDs or objects
        const existingIds = role.permissions.map((p: any) => typeof p === 'string' ? p : p.permissionId || p.id);
        setSelectedPermissions(existingIds);
      } else {
        setSelectedPermissions([]);
      }
    }
  }, [open, isEdit, role]);

  const togglePermission = (id: string) => {
    setSelectedPermissions((prev) => 
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      description: formData.get("description"),
      permissionIds: selectedPermissions,
    };

    console.log("Submitting Role:", data);

    // TODO: Call API to create/update role with permissions
    setTimeout(() => {
      setLoading(false);
      toast.success(isEdit ? "Cập nhật Role thành công!" : "Tạo Role thành công!");
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Chỉnh sửa Vai trò (Role)" : "Tạo Vai trò mới"}</DialogTitle>
          <DialogDescription>
            Điền thông tin vai trò và cấp phát quyền (permissions) tương ứng.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right font-semibold">
                Tên Role
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={role?.name || ""}
                placeholder="VD: Super Admin"
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right font-semibold">
                Mô tả
              </Label>
              <Input
                id="description"
                name="description"
                defaultValue={role?.description || ""}
                placeholder="Quyền quản trị cao nhất..."
                className="col-span-3"
              />
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold border-b pb-2">Danh sách Quyền (Permissions)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {permissions.map((perm) => (
                  <div key={perm.id} className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                    <input 
                      type="checkbox"
                      id={`perm-${perm.id}`}
                      checked={selectedPermissions.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label 
                        htmlFor={`perm-${perm.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {perm.action}_{perm.subject}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {perm.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
