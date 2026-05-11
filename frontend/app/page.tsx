"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { JoinRoomDialog } from '@/components/room/join-room-dialog';
import { useAuthStore } from '@/stores/auth.store';
import Link from 'next/link';
import { Gamepad2, Users, Shield, Zap } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  const handleJoinGame = () => {
    setJoinDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Gamepad2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">QuizGame</span>
          </div>
          
          <nav className="flex items-center gap-4">
            {isHydrated && user ? (
              <>
                <Link href="/quiz">
                  <Button variant="ghost">Quiz của tôi</Button>
                </Link>
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
              </>
            ) : isHydrated ? (
              <>
                <Link href="/signin">
                  <Button variant="ghost">Đăng nhập</Button>
                </Link>
                <Link href="/signup">
                  <Button>Đăng ký</Button>
                </Link>
              </>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <section className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-5xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Chơi Quiz cùng bạn bè
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Tạo phòng chơi, chia sẻ mã PIN và cùng nhau thi đấu theo thời gian thực.
            Giống Kahoot nhưng hoàn toàn miễn phí!
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="text-lg px-8 py-6 shadow-lg shadow-primary/25"
              onClick={handleJoinGame}
            >
              Tham gia ngay
            </Button>
            {user && (
              <Link href="/quiz">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="text-lg px-8 py-6"
                >
                  Tạo Quiz mới
                </Button>
              </Link>
            )}
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Nhanh chóng</CardTitle>
              <CardDescription>
                Tham gia chỉ trong vài giây với mã PIN 6 chữ số
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Nhiều người chơi</CardTitle>
              <CardDescription>
                Cùng chơi với bạn bè, gia đình hoặc đồng nghiệp
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Bảo mật</CardTitle>
              <CardDescription>
                Dữ liệu của bạn được bảo vệ an toàn
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="mt-16 text-center">
          <p className="text-muted-foreground">
            Đã có tài khoản?{' '}
            <Link href="/signin" className="text-primary hover:underline">
              Đăng nhập
            </Link>
            {' '}để tạo quiz của riêng bạn
          </p>
        </section>
      </main>

      <JoinRoomDialog 
        open={joinDialogOpen} 
        onOpenChange={setJoinDialogOpen} 
      />
    </div>
  );
}
