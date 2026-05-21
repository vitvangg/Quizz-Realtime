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
      <header className="bg-white border-b-4 border-black">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="bg-blue-500 border-4 border-black shadow-[4px_4px_0px_0px_#000] p-2 group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-[2px_2px_0px_0px_#000] transition-all">
                <Gamepad2 className="w-7 h-7 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tight">QUIZGAME</span>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-3">
              {isHydrated && user ? (
                <Link href="/quiz">
                  <Button variant="ghost" className="font-bold border-2 border-black shadow-[3px_3px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none bg-white">
                    QUIZ CỦA TÔI
                  </Button>
                </Link>
              ) : isHydrated ? (
                <>
                  <Link href="/signin">
                    <Button variant="ghost" className="font-bold border-2 border-black shadow-[3px_3px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none bg-white">
                      ĐĂNG NHẬP
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button className="bg-pink-500 text-white border-4 border-black shadow-[4px_4px_0px_0px_#000] font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                      ĐĂNG KÝ
                    </Button>
                  </Link>
                </>
              ) : null}
            </nav>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT - Centered Join Card */}
      <main className="flex flex-col items-center justify-center flex-1 px-4 py-6 md:py-8">
        <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">

          {/* Join Card - Neo-Brutalist Style - CENTERED */}
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-black text-center mb-4 sm:mb-6 uppercase tracking-wide">
              THAM GIA NGAY
            </h2>

            <div className="space-y-4">
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
                  className="h-14 sm:h-16 text-2xl text-center font-black tracking-[0.5em] border-4 border-black bg-yellow-100 focus:bg-yellow-200 rounded-none focus:ring-0 focus:outline-none focus:border-black transition-all"
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
                  className="h-12 sm:h-14 text-base sm:text-lg font-semibold border-4 border-black bg-yellow-100 focus:bg-yellow-200 rounded-none focus:ring-0 focus:outline-none focus:border-black transition-all"
                  maxLength={20}
                />
              </div>

              {/* Join Button */}
              <Button
                onClick={handleJoinGame}
                disabled={!pin || pin.length < 6 || !nickname.trim() || loading}
                className="w-full h-14 sm:h-16 text-lg sm:text-xl font-black bg-green-500 hover:bg-green-600 text-white border-4 border-black shadow-[6px_6px_0px_0px_#000] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px_#000] disabled:bg-gray-300 disabled:border-gray-400 disabled:shadow-none transition-all rounded-none"
              >
                {loading ? 'ĐANG THAM GIA...' : 'THAM GIA NGAY!'}
              </Button>
            </div>

            <div className="mt-6 pt-6 border-t-4 border-black">
              <p className="text-center text-xs sm:text-sm font-bold">
                Hoặc{' '}
                <Link href="/signin" className="text-blue-600 hover:underline">
                  đăng nhập
                </Link>{' '}
                để tạo quiz của riêng bạn
              </p>
            </div>
          </div>

          {/* Feature Cards - Responsive Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6 sm:mt-8">
            <div className="bg-blue-500 border-4 border-black shadow-brutal-sm p-3 sm:p-4 text-center">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 mx-auto mb-1" />
              <p className="text-[10px] sm:text-xs font-black text-white uppercase">Nhanh</p>
            </div>
            <div className="bg-pink-500 border-4 border-black shadow-brutal-sm p-3 sm:p-4 text-center">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white mx-auto mb-1" />
              <p className="text-[10px] sm:text-xs font-black text-white uppercase">Đông vui</p>
            </div>
            <div className="bg-green-500 border-4 border-black shadow-brutal-sm p-3 sm:p-4 text-center">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white mx-auto mb-1" />
              <p className="text-[10px] sm:text-xs font-black text-white uppercase">Bảo mật</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
