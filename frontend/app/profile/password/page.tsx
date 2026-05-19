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
    <div className="min-h-screen bg-white">
      {/* Header Banner */}
      <div className="bg-neon-green border-b-4 border-black">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-black uppercase tracking-tight">ĐỔI MẬT KHẨU</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="border-4 border-black shadow-brutal overflow-hidden">
          <CardHeader className="bg-neon-pink border-b-4 border-black">
            <div className="flex items-center gap-4">
              <div className="bg-black border-4 border-black shadow-brutal-sm p-3">
                <Lock className="h-7 w-7 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-black uppercase">Bảo vệ tài khoản</CardTitle>
                <p className="text-xs font-medium text-black/60">Đổi mật khẩu để bảo vệ tài khoản</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Old Password */}
              <div className="space-y-3">
                <Label htmlFor="oldPassword" className="font-black uppercase tracking-wider text-xs">
                  Mật khẩu hiện tại
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/50" />
                  <Input
                    id="oldPassword"
                    type={showOldPass ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-12 pr-12 h-14 rounded-xl border-4 border-black font-bold text-lg focus:border-neon-pink"
                    value={passwords.oldPassword}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-black/50 hover:text-black transition-colors"
                  >
                    {showOldPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* New Passwords Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="newPassword" className="font-black uppercase tracking-wider text-xs">
                    Mật khẩu mới
                  </Label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/50" />
                    <Input
                      id="newPassword"
                      type={showNewPass ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-12 pr-12 h-14 rounded-xl border-4 border-black font-bold text-lg focus:border-neon-pink"
                      value={passwords.newPassword}
                      onChange={handleChange}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-black/50 hover:text-black transition-colors"
                    >
                      {showNewPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="confirmPassword" className="font-black uppercase tracking-wider text-xs">
                    Xác nhận mật khẩu
                  </Label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/50" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPass ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-12 pr-12 h-14 rounded-xl border-4 border-black font-bold text-lg focus:border-neon-pink"
                      value={passwords.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-black/50 hover:text-black transition-colors"
                    >
                      {showConfirmPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-14 rounded-xl font-black text-lg bg-black border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
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
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
