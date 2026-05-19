"use client";

import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  User, 
  ArrowLeft, 
  ShieldCheck,
  Mail,
  UserCircle,
  KeyRound
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();
  const pathname = usePathname();

  if (!user) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground font-black animate-pulse uppercase tracking-widest">Đang tải...</p>
      </div>
    );
  }

  const navItems = [
    {
      label: "Thông tin cá nhân",
      href: "/profile",
      icon: UserCircle
    },
    {
      label: "Đổi mật khẩu",
      href: "/profile/password",
      icon: KeyRound
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 space-y-12 pb-32">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-0 z-40 bg-background/90 backdrop-blur-xl py-6 px-4 md:px-8 border-b transition-all duration-300 rounded-b-3xl">
        <div className="flex items-center gap-5">
          <Link href="/quiz">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-muted hover:bg-primary hover:text-white transition-all border shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>

          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase">
              Hồ sơ cá nhân
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Quản lý tài khoản và bảo mật
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-6">
        {/* SHARED SIDEBAR */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="border-2 border-primary/10 overflow-hidden rounded-3xl shadow-xl shadow-primary/5">
            <div className="h-24 bg-gradient-to-br from-primary to-primary-foreground opacity-20" />
            <CardContent className="pt-0 -mt-12 flex flex-col items-center text-center px-6 pb-8">
              <div className="bg-background p-2 rounded-full mb-4 border-4 border-muted">
                {user.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <div className="bg-primary/10 p-6 rounded-full">
                    <User className="h-12 w-12 text-primary" />
                  </div>
                )}
              </div>
              <h2 className="text-xl font-black truncate w-full">{user.fullName || user.email.split('@')[0]}</h2>
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-xs mt-1 break-all">
                <Mail className="h-3 w-3" />
                {user.email}
              </div>
              
              <div className="mt-8 w-full space-y-2">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={pathname === item.href ? "default" : "ghost"}
                      className={cn(
                        "w-full justify-start gap-3 h-12 rounded-xl font-bold transition-all",
                        pathname === item.href ? "shadow-lg shadow-primary/20 scale-[1.02]" : "hover:bg-primary/5"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </div>

              <div className="mt-8 w-full pt-6 border-t space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-bold uppercase tracking-tighter">Vai trò</span>
                  <span className="font-black text-primary uppercase">{user.role || "USER"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-bold uppercase tracking-tighter">Trạng thái</span>
                  <span className="font-black text-green-500 uppercase">Hoạt động</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PAGE CONTENT */}
        <div className="lg:col-span-3">
          {children}
        </div>
      </div>
    </div>
  );
}
