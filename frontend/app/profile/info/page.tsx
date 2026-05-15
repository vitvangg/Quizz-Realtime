"use client";

import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Shield, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ProfileInfoPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/signin");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header Banner */}
      <div className="bg-neon-blue border-b-4 border-black">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-black uppercase tracking-tight">HỒ SƠ CỦA TÔI</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* User Info Card */}
        <Card className="border-4 border-black shadow-brutal mb-6">
          <CardHeader className="bg-neon-yellow border-b-4 border-black">
            <div className="flex items-center gap-4">
              <div className="bg-black border-4 border-black shadow-brutal-sm p-4">
                <User className="h-8 w-8 text-neon-yellow" />
              </div>
              <CardTitle className="text-2xl font-black uppercase">Thông tin tài khoản</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-4 p-4 bg-neon-yellow/30 rounded-xl border-4 border-black">
              <Mail className="h-6 w-6 text-black" />
              <div>
                <p className="text-xs font-bold uppercase text-black/50">Email</p>
                <p className="font-bold text-lg">{user?.email || 'user@example.com'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-neon-green/30 rounded-xl border-4 border-black">
              <Shield className="h-6 w-6 text-black" />
              <div>
                <p className="text-xs font-bold uppercase text-black/50">Vai trò</p>
                <p className="font-bold text-lg">{(user as any)?.role || 'USER'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/profile/password">
            <Button className="w-full h-14 text-base font-bold bg-neon-orange border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all rounded-xl">
              <Shield className="h-5 w-5 mr-2" />
              ĐỔI MẬT KHẨU
            </Button>
          </Link>
          <Button
            onClick={handleLogout}
            className="w-full h-14 text-base font-bold bg-red-500 border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all rounded-xl"
          >
            <LogOut className="h-5 w-5 mr-2" />
            ĐĂNG XUẤT
          </Button>
        </div>
      </div>
    </div>
  );
}
