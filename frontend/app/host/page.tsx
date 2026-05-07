'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { QuizCard } from '@/components/game/QuizCard';
import { quizService } from '@/services/quiz.service';
import { roomService } from '@/services/room.service';
import { useAuthStore } from '@/stores/auth.store';
import type { Quiz } from '@/types/game';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Plus, LogOut, Gamepad2, Loader2, ShieldCheck } from 'lucide-react';

export default function HostDashboardPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creatingRoomId, setCreatingRoomId] = useState<string | null>(null);
  const router = useRouter();
  const { accessToken, logout, isHydrated, user } = useAuthStore();

  const loadQuizzes = async () => {
    try {
      if (!isHydrated) return;

      if (!accessToken) {
        toast.error('Please login to access host dashboard');
        router.push('/signin');
        return;
      }

      // Load real quizzes from API
      const data = await quizService.getMyQuizzes();
      setQuizzes(data);
    } catch (error) {
      console.error('Error loading quizzes:', error);
      toast.error('Failed to load quizzes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isHydrated) {
      loadQuizzes();
    }
  }, [isHydrated]);

  const handleLiveHost = async (quizId: string) => {
    setCreatingRoomId(quizId);
    try {
      // Create real room via API
      const room = await roomService.createRoom({ quizId });

      toast.success('Room created! Share the PIN with players.');

      // Navigate to waiting room
      router.push(`/room/${room.pin}`);
    } catch (error: any) {
      console.error('Error creating room:', error);
      toast.error(error.response?.data?.message || 'Failed to create room');
    } finally {
      setCreatingRoomId(null);
    }
  };

  const handleEdit = (quizId: string) => {
    router.push(`/admin/quizzes/builder?quizId=${quizId}`);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Gamepad2 className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Host Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Manage your quizzes and start games
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4" />
                  <span>{user.email}</span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
              >
                <LogOut className="size-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-lg font-semibold">My Quizzes</h2>
          <p className="text-sm text-muted-foreground">
            Select a quiz to start hosting a live game session
          </p>
        </div>

        {quizzes.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
                <Gamepad2 className="size-7 text-muted-foreground" />
              </div>
              <CardTitle>No quizzes yet</CardTitle>
              <CardDescription>
                Create your first quiz to start hosting interactive game sessions
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              <Button asChild className="gap-2">
                <a href="/admin/quizzes/builder">
                  <Plus className="size-4" />
                  Create New Quiz
                </a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {quizzes.map((quiz) => (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  onLiveHost={() => handleLiveHost(quiz.id)}
                  onEdit={() => handleEdit(quiz.id)}
                  isLoading={creatingRoomId === quiz.id}
                />
              ))}
            </div>

            {/* Create New Quiz Button */}
            <div className="mt-8 flex justify-center">
              <Button asChild variant="outline" className="gap-2">
                <a href="/admin/quizzes/builder">
                  <Plus className="size-4" />
                  Create New Quiz
                </a>
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
