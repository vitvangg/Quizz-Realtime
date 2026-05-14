"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useUserStore } from "@/stores/user.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  User, 
  Loader2,
  Camera,
  Phone,
  UserCircle,
  FileText
} from "lucide-react";

export default function ProfileInfoPage() {
  const { user } = useAuthStore();
  const { updateProfile, loading } = useUserStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    fullName: user?.fullName || "",
    avatar: user?.avatar || "",
    phoneNumber: user?.phoneNumber || "",
    bio: user?.bio || ""
  });

  useEffect(() => {
    if (user) {
      setProfile({
        fullName: user.fullName || "",
        avatar: user.avatar || "",
        phoneNumber: user.phoneNumber || "",
        bio: user.bio || ""
      });
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProfile({
      ...profile,
      [e.target.id]: e.target.value
    });
  };

  const handleCancel = () => {
    if (user) {
      setProfile({
        fullName: user.fullName || "",
        avatar: user.avatar || "",
        phoneNumber: user.phoneNumber || "",
        bio: user.bio || ""
      });
    }
    setIsEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(profile);
      setIsEditing(false);
    } catch (error) {
      // Error handled by store
    }
  };

  return (
    <Card className="border-2 border-primary/10 shadow-sm overflow-hidden rounded-3xl">
      <CardHeader className="bg-muted/30 border-b pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <UserCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Thông tin cơ bản</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">
                {isEditing ? "Cập nhật thông tin công khai của bạn" : "Xem thông tin tài khoản công khai"}
              </p>
            </div>
          </div>

          {!isEditing && (
            <Button 
              variant="outline" 
              onClick={() => setIsEditing(true)}
              className="rounded-xl font-bold border-2 border-primary/20 hover:bg-primary hover:text-white transition-all"
            >
              CHỈNH SỬA
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="avatar" className="font-bold uppercase tracking-widest text-xs px-1 text-muted-foreground">
              Link ảnh đại diện
            </Label>
            <div className="relative">
              <Camera className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="avatar"
                type="text"
                placeholder="https://example.com/avatar.jpg"
                className="pl-12 h-14 rounded-2xl border-2 font-bold text-lg focus-visible:ring-primary disabled:bg-muted/50 disabled:opacity-100"
                value={profile.avatar}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="fullName" className="font-bold uppercase tracking-widest text-xs px-1 text-muted-foreground">
                Họ và tên
              </Label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Chưa cập nhật"
                  className="pl-12 h-14 rounded-2xl border-2 font-bold text-lg focus-visible:ring-primary disabled:bg-muted/50 disabled:opacity-100"
                  value={profile.fullName}
                  onChange={handleChange}
                  disabled={!isEditing}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="phoneNumber" className="font-bold uppercase tracking-widest text-xs px-1 text-muted-foreground">
                Số điện thoại
              </Label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="phoneNumber"
                  type="text"
                  placeholder="Chưa cập nhật"
                  className="pl-12 h-14 rounded-2xl border-2 font-bold text-lg focus-visible:ring-primary disabled:bg-muted/50 disabled:opacity-100"
                  value={profile.phoneNumber}
                  onChange={handleChange}
                  disabled={!isEditing}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="bio" className="font-bold uppercase tracking-widest text-xs px-1 text-muted-foreground">
              Tiểu sử
            </Label>
            <div className="relative">
              <FileText className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
              <textarea
                id="bio"
                placeholder="Giới thiệu ngắn về bản thân..."
                className="w-full min-h-[120px] pl-12 pr-4 py-4 rounded-2xl border-2 font-bold text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary bg-background disabled:bg-muted/50 disabled:opacity-100 disabled:cursor-not-allowed"
                value={profile.bio}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-14 rounded-2xl font-black text-lg border-2 transition-all hover:bg-muted"
                onClick={handleCancel}
                disabled={loading}
              >
                HỦY
              </Button>
              <Button
                type="submit"
                className="flex-[2] h-14 rounded-2xl font-black text-lg shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    ĐANG LƯU...
                  </div>
                ) : (
                  "LƯU THÔNG TIN"
                )}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
