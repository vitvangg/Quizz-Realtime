"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Lock, 
  KeyRound,
  Eye,
  EyeOff,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { changePassword, loading, logout } = useAuthStore();
  
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [passwords, setPasswords] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswords({
      ...passwords,
      [e.target.id]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp!");
      return;
    }

    if (passwords.newPassword.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự!");
      return;
    }

    try {
      await changePassword({
        oldPassword: passwords.oldPassword,
        newPassword: passwords.newPassword
      });
      
      toast.success("Vui lòng đăng nhập lại với mật khẩu mới");
      await logout();
      router.push("/signin");
      
    } catch (error) {
      // Error handled by store
    }
  };

  return (
    <Card className="border-2 border-primary/10 shadow-sm overflow-hidden rounded-3xl">
      <CardHeader className="bg-muted/30 border-b pb-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl font-black uppercase tracking-tight">Đổi mật khẩu</CardTitle>
            <p className="text-xs text-muted-foreground font-medium">Bảo vệ tài khoản của bạn bằng mật khẩu mạnh</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="oldPassword" className="font-bold uppercase tracking-widest text-xs px-1 text-muted-foreground">
              Mật khẩu hiện tại
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="oldPassword"
                type={showOldPass ? "text" : "password"}
                placeholder="••••••••"
                className="pl-12 pr-12 h-14 rounded-2xl border-2 font-bold text-lg focus-visible:ring-primary"
                value={passwords.oldPassword}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                onClick={() => setShowOldPass(!showOldPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
              >
                {showOldPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="newPassword" className="font-bold uppercase tracking-widest text-xs px-1 text-muted-foreground">
                Mật khẩu mới
              </Label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type={showNewPass ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-12 pr-12 h-14 rounded-2xl border-2 font-bold text-lg focus-visible:ring-primary"
                  value={passwords.newPassword}
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showNewPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="confirmPassword" className="font-bold uppercase tracking-widest text-xs px-1 text-muted-foreground">
                Xác nhận mật khẩu
              </Label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPass ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-12 pr-12 h-14 rounded-2xl border-2 font-bold text-lg focus-visible:ring-primary"
                  value={passwords.confirmPassword}
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showConfirmPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full h-14 rounded-2xl font-black text-lg shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  ĐANG XỬ LÝ...
                </div>
              ) : (
                "CẬP NHẬT MẬT KHẨU"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
