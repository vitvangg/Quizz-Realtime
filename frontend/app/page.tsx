"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { useRoomStore } from '@/stores/room.store';
import Link from 'next/link';
import { toast } from 'sonner';
import { Gamepad2, Zap, Users, Shield } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const { joinRoom, loading } = useRoomStore();

  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');

  const handleJoinGame = async () => {
    if (!pin || pin.length < 6) {
      toast.error('Mã PIN phải có 6 chữ số');
      return;
    }
    if (!nickname.trim()) {
      toast.error('Vui lòng nhập nickname');
      return;
    }

    try {
      await joinRoom(pin, nickname);
      toast.success('Tham gia phòng thành công!');
      const room = useRoomStore.getState().currentRoom;
      if (room) {
        router.push(`/room/${room.id}`);
      }
    } catch (err) {
      toast.error('Không thể tham gia phòng');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJoinGame();
    }
  };

  return (
    <div className="min-h-screen bg-yellow-300">
      {/* HEADER */}
      <header className="bg-white border-b-4 border-black sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
              <div className="bg-blue-500 border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_#000] sm:shadow-[4px_4px_0px_0px_#000] p-1.5 sm:p-2 group-hover:translate-x-[1px] group-hover:translate-y-[1px] sm:group-hover:translate-x-[2px] sm:group-hover:translate-y-[2px] group-hover:shadow-none transition-all">
                <Gamepad2 className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <span className="text-lg sm:text-2xl font-black tracking-tight hidden min-[400px]:block">QUIZGAME</span>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-2 sm:gap-3">
              {isHydrated && user ? (
                <Link href="/quiz">
                  <Button variant="ghost" className="h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] sm:shadow-[3px_3px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px] hover:shadow-none bg-white">
                    QUIZ CỦA TÔI
                  </Button>
                </Link>
              ) : isHydrated ? (
                <>
                  <Link href="/signin">
                    <Button variant="ghost" className="h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] sm:shadow-[3px_3px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px] hover:shadow-none bg-white uppercase">
                      Đăng nhập
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button className="h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm bg-pink-500 text-white border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_#000] sm:shadow-[4px_4px_0px_0px_#000] font-black hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[2px] sm:hover:translate-y-[2px] hover:shadow-none transition-all uppercase">
                      Đăng ký
                    </Button>
                  </Link>
                </>
              ) : null}
            </nav>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT - Centered Join Card */}
      <main className="flex flex-col items-center justify-center flex-1 px-4 py-8 sm:py-12">
        <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">

          {/* Join Card - Neo-Brutalist Style - CENTERED */}
          <div className="bg-white border-4 border-black shadow-[6px_6px_0px_0px_#000] sm:shadow-[8px_8px_0px_0px_#000] p-6 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-black text-center mb-6 sm:mb-8 uppercase tracking-wide">
              THAM GIA PHÒNG
            </h2>

            <div className="space-y-5">
              {/* PIN Input */}
              <div>
                <label className="block text-xs sm:text-sm font-bold uppercase mb-2 tracking-wider">
                  Mã PIN trò chơi
                </label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={handleKeyDown}
                  className="h-14 sm:h-20 text-2xl sm:text-4xl text-center font-black tracking-[0.3em] sm:tracking-[0.5em] border-4 border-black bg-yellow-100 focus:bg-yellow-200 rounded-none focus:ring-0 focus:outline-none focus:border-black transition-all placeholder:tracking-normal placeholder:text-gray-400"
                  maxLength={6}
                />
              </div>

              {/* Nickname Input */}
              <div>
                <label className="block text-xs sm:text-sm font-bold uppercase mb-2 tracking-wider">
                  Nickname của bạn
                </label>
                <Input
                  type="text"
                  placeholder="Nhập nickname..."
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                  onKeyDown={handleKeyDown}
                  className="h-12 sm:h-16 text-base sm:text-xl font-bold border-4 border-black bg-yellow-100 focus:bg-yellow-200 rounded-none focus:ring-0 focus:outline-none focus:border-black transition-all"
                  maxLength={20}
                />
              </div>

              {/* Join Button */}
              <Button
                onClick={handleJoinGame}
                disabled={!pin || pin.length < 6 || !nickname.trim() || loading}
                className="w-full h-14 sm:h-20 text-lg sm:text-2xl font-black bg-green-500 hover:bg-green-600 text-white border-4 border-black shadow-[4px_4px_0px_0px_#000] sm:shadow-[8px_8px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] sm:hover:translate-x-[4px] sm:hover:translate-y-[4px] hover:shadow-none disabled:bg-gray-300 disabled:border-gray-400 disabled:shadow-none transition-all rounded-none uppercase"
              >
                {loading ? 'ĐANG THAM GIA...' : 'THAM GIA NGAY!'}
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t-4 border-black">
              <p className="text-center text-sm sm:text-base font-bold">
                Hoặc{' '}
                <Link href="/signin" className="text-blue-600 hover:underline decoration-2 underline-offset-4">
                  đăng nhập
                </Link>{' '}
                để tạo quiz của riêng bạn
              </p>
            </div>
          </div>

          {/* Feature Cards - Responsive Grid */}
          <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-8 sm:mt-12">
            <div className="bg-blue-500 border-4 border-black shadow-[4px_4px_0px_0px_#000] p-3 sm:p-6 text-center group hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
              <Zap className="w-6 h-6 sm:w-10 sm:h-10 text-yellow-300 mx-auto mb-2" />
              <p className="text-[10px] sm:text-sm font-black text-white uppercase tracking-tighter sm:tracking-normal">Nhanh chóng</p>
            </div>
            <div className="bg-pink-500 border-4 border-black shadow-[4px_4px_0px_0px_#000] p-3 sm:p-6 text-center group hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
              <Users className="w-6 h-6 sm:w-10 sm:h-10 text-white mx-auto mb-2" />
              <p className="text-[10px] sm:text-sm font-black text-white uppercase tracking-tighter sm:tracking-normal">Đông vui</p>
            </div>
            <div className="bg-green-500 border-4 border-black shadow-[4px_4px_0px_0px_#000] p-3 sm:p-6 text-center group hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
              <Shield className="w-6 h-6 sm:w-10 sm:h-10 text-white mx-auto mb-2" />
              <p className="text-[10px] sm:text-sm font-black text-white uppercase tracking-tighter sm:tracking-normal">Bảo mật</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
