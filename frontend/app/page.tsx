"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useRoomStore } from "@/stores/room.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Users, LogIn } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function LandingPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const { joinRoom, loading } = useRoomStore();
  
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pin || pin.length !== 6) {
      toast.error("Vui lòng nhập mã PIN 6 số");
      return;
    }
    
    if (!nickname || nickname.length < 1) {
      toast.error("Vui lòng nhập nickname");
      return;
    }

    const success = await joinRoom(pin, nickname);
    
    if (success) {
      // Room state sẽ được update trong store
      // Redirect sau khi nhận room_joined event
      router.push(`/room/join?pin=${pin}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 to-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Quiz Game
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Chơi quiz cùng bạn bè theo thời gian thực. Tạo câu hỏi, chia sẻ mã PIN và bắt đầu!
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Join Game Card */}
          <Card className="shadow-xl border-2">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Play className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">Tham gia Game</CardTitle>
              </div>
              <CardDescription>
                Nhập mã PIN từ người chia sẻ để tham gia
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinGame} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pin">Mã PIN</Label>
                  <Input
                    id="pin"
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    className="text-center text-2xl tracking-[0.5em] font-bold h-14"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname">Nickname</Label>
                  <Input
                    id="nickname"
                    type="text"
                    placeholder="Tên của bạn"
                    maxLength={20}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="h-12"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg gap-2"
                  disabled={loading}
                >
                  <LogIn className="h-5 w-5" />
                  {loading ? "Đang tham gia..." : "Tham gia Game"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Auth Card */}
          <Card className="shadow-xl border-2">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">
                  {user ? "Xin chào!" : "Đăng nhập / Đăng ký"}
                </CardTitle>
              </div>
              <CardDescription>
                {user 
                  ? `Tài khoản: ${user.email || user.id}`
                  : "Tạo quiz của riêng bạn và chia sẻ với bạn bè"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user ? (
                <>
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <p className="font-medium mb-2">Bạn đã đăng nhập</p>
                    <p className="text-sm text-muted-foreground">
                      Truy cập /quiz để tạo và quản lý quiz của bạn
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full h-12 text-lg"
                    onClick={() => router.push("/quiz")}
                  >
                    <Play className="h-5 w-5 mr-2" />
                    Đi đến Quiz của tôi
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full"
                    onClick={() => useAuthStore.getState().logout()}
                  >
                    Đăng xuất
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground text-center">
                    Đăng nhập để tạo quiz và tổ chức game
                  </p>
                  <Link href="/signin">
                    <Button variant="outline" className="w-full h-12 text-lg">
                      Đăng nhập
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button className="w-full h-12 text-lg">
                      Đăng ký
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="mt-16 grid md:grid-cols-3 gap-6 text-center">
          <div className="p-6">
            <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">Realtime</h3>
            <p className="text-muted-foreground text-sm">
              Chơi cùng lúc với bạn bè, xem kết quả ngay lập tức
            </p>
          </div>
          <div className="p-6">
            <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">Nhiều người chơi</h3>
            <p className="text-muted-foreground text-sm">
              Hỗ trợ nhiều người chơi cùng lúc trong một phòng
            </p>
          </div>
          <div className="p-6">
            <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="font-bold text-lg mb-2">Tạo Quiz</h3>
            <p className="text-muted-foreground text-sm">
              Tạo bộ câu hỏi riêng và chia sẻ với mọi người
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
