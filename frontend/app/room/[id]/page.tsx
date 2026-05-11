"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRoomStore } from "@/stores/room.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Copy, LogOut, Play, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const roomId = params.id as string;
  const quizIdFromUrl = searchParams.get("quizId");
  const action = searchParams.get("action");
  
  const {
    currentRoom,
    players,
    myPlayer,
    isHost,
    connectionStatus,
    loading,
    error,
    createRoom,
    getRoom,
    joinRoomById,
    leaveRoom,
    reset,
  } = useRoomStore();

  const [nickname, setNickname] = useState("");
  const [showNicknameInput, setShowNicknameInput] = useState(false);

  // Handle room creation (from quiz page)
  useEffect(() => {
    const initAsHost = async () => {
      if (action === "create" && quizIdFromUrl) {
        const room = await createRoom(quizIdFromUrl);
        if (room) {
          router.replace(`/room/${room.id}`);
        }
      }
    };
    
    initAsHost();
  }, [action, quizIdFromUrl]);

  // Handle room load (from URL)
  useEffect(() => {
    const initAsPlayer = async () => {
      if (roomId && action !== "create") {
        const room = await getRoom(roomId);
        if (room) {
          setShowNicknameInput(true);
        } else {
          toast.error("Không tìm thấy phòng");
          router.push("/");
        }
      }
    };
    
    initAsPlayer();
  }, [roomId, action]);

  const handleJoinAsGuest = async () => {
    if (!nickname.trim()) {
      toast.error("Vui lòng nhập nickname");
      return;
    }

    const success = await joinRoomById(roomId, nickname);
    if (success) {
      setShowNicknameInput(false);
    }
  };

  const handleCopyPin = () => {
    if (currentRoom?.pin) {
      navigator.clipboard.writeText(currentRoom.pin);
      toast.success("Đã copy mã PIN!");
    }
  };

  const handleLeaveRoom = async () => {
    await leaveRoom();
    router.push("/");
  };

  const handleStartGame = () => {
    // TODO: Emit start_game event via socket
    toast.info("Tính năng đang phát triển");
  };

  // Loading state
  if (loading && !currentRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Đang tạo phòng...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !currentRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại trang chủ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Nickname input state (for joining)
  if (showNicknameInput && !currentRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Tham gia phòng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nickname">Nhập nickname của bạn</Label>
              <Input
                id="nickname"
                type="text"
                placeholder="Tên hiển thị (1-20 ký tự)"
                maxLength={20}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="h-12 text-center text-lg"
              />
            </div>
            <Button
              className="w-full h-12 text-lg"
              onClick={handleJoinAsGuest}
              disabled={loading}
            >
              Tham gia
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push("/")}>
              Hủy
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main room UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={handleLeaveRoom}>
            <LogOut className="h-4 w-4 mr-2" />
            Thoát phòng
          </Button>
          <div className="text-sm text-muted-foreground">
            Trạng thái: {connectionStatus === "connected" ? "Đã kết nối" : "Đang kết nối..."}
          </div>
        </div>

        {/* Room Info */}
        <Card className="mb-6 shadow-xl border-2">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Mã PIN phòng</p>
              <div className="flex items-center justify-center gap-4">
                <span className="text-5xl font-black tracking-widest text-primary">
                  {currentRoom?.pin || "------"}
                </span>
                <Button variant="outline" size="icon" onClick={handleCopyPin}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-lg font-medium mt-4">{currentRoom?.quiz?.title}</p>
              <p className="text-sm text-muted-foreground">
                {currentRoom?.quiz?.questionCount || 0} câu hỏi
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Players List */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Người chơi ({players.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {players.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Đang chờ người chơi...
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg border-2 text-center ${
                      player.id === myPlayer?.id
                        ? "border-primary bg-primary/5"
                        : "border-muted"
                    }`}
                  >
                    <p className="font-medium truncate">{player.nickname}</p>
                    {player.isHost && (
                      <span className="text-xs text-primary font-medium">Host</span>
                    )}
                    {player.id === myPlayer?.id && (
                      <span className="text-xs text-muted-foreground">(Bạn)</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Host Actions */}
        {isHost && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Bạn là người tổ chức. Bấm nút bên dưới để bắt đầu game!
                </p>
                <Button
                  size="lg"
                  className="text-lg px-8"
                  onClick={handleStartGame}
                  disabled={players.length < 1}
                >
                  <Play className="h-5 w-5 mr-2" />
                  Bắt đầu Game
                </Button>
                {players.length < 1 && (
                  <p className="text-sm text-muted-foreground">
                    Cần ít nhất 1 người chơi để bắt đầu
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Player waiting message */}
        {!isHost && currentRoom?.status === "WAITING" && (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                Đang chờ host bắt đầu game...
              </p>
              <div className="mt-4 flex justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Link for sharing */}
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Chia sẻ mã PIN này với bạn bè để cùng chơi!
          </p>
          <p className="font-medium text-lg">
            PIN: <span className="text-primary font-bold">{currentRoom?.pin}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
