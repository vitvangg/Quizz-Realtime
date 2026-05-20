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
import { useUserStore } from "@/stores/user.store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: any; // Dữ liệu user nếu đang edit
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const { createUser, updateUser, roles, fetchRoles } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    roleId: "",
    status: "ACTIVE",
  });

  const isEdit = !!user;

  useEffect(() => {
    if (open) {
      fetchRoles();
    }
  }, [open, fetchRoles]);

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || "",
        password: "", // Không hiển thị mật khẩu cũ
        fullName: user.fullName || "",
        roleId: user.roleId || "",
        status: user.status || "ACTIVE",
      });
    } else {
      setFormData({
        email: "",
        password: "",
        fullName: "",
        roleId: "",
        status: "ACTIVE",
      });
    }
  }, [user, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { 
        ...formData,
        roleId: formData.roleId === "" ? null : formData.roleId 
      };

      if (isEdit) {
        // Chỉ gửi password nếu người dùng nhập mật khẩu mới
        if (!payload.password) delete payload.password;
        await updateUser(user.id, payload);
      } else {
        await createUser(payload);
      }
      onOpenChange(false);
    } catch (error) {
      // Toast đã được handle trong store
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Chỉnh sửa User" : "Thêm User mới"}</DialogTitle>
          <DialogDescription>
            Điền thông tin chi tiết của người dùng. Nhấn lưu để hoàn tất.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fullName" className="text-right">
                Họ tên
              </Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="col-span-3"
                required
                disabled={isEdit}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                {isEdit ? "Mật khẩu mới" : "Mật khẩu"}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder={isEdit ? "Bỏ trống nếu không đổi" : ""}
                className="col-span-3"
                required={!isEdit}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="roleId" className="text-right">
                Vai trò
              </Label>
              <select 
                id="roleId" 
                className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.roleId}
                onChange={handleChange}
              >
                <option value="">Mặc định (User)</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                Trạng thái
              </Label>
              <select 
                id="status" 
                className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="ACTIVE">Hoạt động</option>
                <option value="BANNED">Bị khóa</option>
              </select>
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
