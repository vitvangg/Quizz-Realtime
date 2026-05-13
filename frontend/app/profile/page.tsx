"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  User, 
  Lock, 
  ArrowLeft, 
  ShieldCheck,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Loader2
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function ProfilePage() {
  const router = useRouter();
  const { user, changePassword, loading, logout } = useAuthStore();
  
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
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
      
      // Sau khi đổi mật khẩu thành công, đăng xuất và chuyển về trang đăng nhập
      toast.success("Vui lòng đăng nhập lại với mật khẩu mới");
      await logout();
      router.push("/signin");
      
    } catch (error) {
      // Error handled by store
    }
  };

  if (!user) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground font-black animate-pulse uppercase tracking-widest">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-12 pb-32">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-16 z-40 bg-background/90 backdrop-blur-xl py-6 border-b transition-all duration-300">
        <div className="flex items-center gap-5">
          <Link href="/quiz">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-2xl bg-muted hover:bg-primary hover:text-white transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>

          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase">
              Hồ sơ cá nhân
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Quản lý thông tin bảo mật
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* INFO SIDEBAR */}
        <div className="space-y-6">
          <Card className="border-2 border-primary/10 overflow-hidden rounded-3xl shadow-xl shadow-primary/5">
            <div className="h-24 bg-gradient-to-br from-primary to-primary-foreground opacity-20" />
            <CardContent className="pt-0 -mt-12 flex flex-col items-center text-center px-6 pb-8">
              <div className="bg-background p-2 rounded-full mb-4 border-4 border-muted">
                <div className="bg-primary/10 p-6 rounded-full">
                  <User className="h-12 w-12 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-black truncate w-full">{user.email.split('@')[0]}</h2>
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-sm mt-1">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </div>
              <div className="mt-6 w-full pt-6 border-t space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-bold uppercase tracking-tighter">Vai trò</span>
                  <span className="font-black text-primary uppercase">{user.role || "USER"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-bold uppercase tracking-tighter">Trạng thái</span>
                  <span className="font-black text-green-500 uppercase">Hoạt động</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MAIN FORMS */}
        <div className="lg:col-span-2 space-y-8">
          {/* PASSWORD FORM */}
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
              <form onSubmit={handleUpdatePassword} className="space-y-6">
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
        </div>
      </div>
    </div>
  );
}
