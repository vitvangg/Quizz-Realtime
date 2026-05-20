"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth.store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LogOut,
  User,

  Gamepad2
} from "lucide-react";

export default function QuizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isHydrated, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !user) {
      router.push('/');
    }
  }, [user, isHydrated, router]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-7xl">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="bg-primary p-1.5 rounded-lg rotate-3 group-hover:rotate-0 transition-transform">
                <Gamepad2 className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-black tracking-tighter text-primary">QUIZZY</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-4 pl-4 border-l">
                <div className="hidden sm:flex flex-col items-end">
                  <p className="text-sm font-bold leading-none">{user.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Người tạo</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-muted hover:bg-muted/80 h-10 w-10 overflow-hidden"
                    asChild
                  >
                    <Link href="/profile" title="Hồ sơ cá nhân">
                      <User className="h-4 w-4 text-primary" />
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-muted hover:bg-muted/80 h-10 w-10 overflow-hidden"
                    onClick={handleLogout}
                    title="Đăng xuất"
                  >
                    <LogOut className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button asChild className="rounded-full px-6">
                <Link href="/signin">Đăng nhập</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow pb-20">
        {children}
      </main>

      {/* Simple Footer */}
      <footer className="border-t bg-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2026 Quizzy Realtime Platform. Được thiết kế cho sự tương tác đỉnh cao.
          </p>
        </div>
      </footer>
    </div>
  );
}
