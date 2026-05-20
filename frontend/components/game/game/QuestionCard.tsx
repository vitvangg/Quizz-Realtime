'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Target } from 'lucide-react';

interface QuestionCardProps {
  content: string;
  questionIndex: number;
  totalQuestions: number;
}

export function QuestionCard({ content, questionIndex, totalQuestions }: QuestionCardProps) {
  return (
    <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
      <CardHeader className="bg-neon-pink border-b-4 border-black pb-4">
        <div className="flex items-center gap-3">
          <Target className="w-8 h-8 text-white" />
          <CardTitle className="text-2xl font-black text-white text-center leading-relaxed flex-1">
            {content}
          </CardTitle>
        </div>
      </CardHeader>
    </Card>
  );
}

interface QuestionHeaderProps {
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
  TimerBadge: React.ReactNode;
}

export function QuestionHeader({ questionIndex, totalQuestions, timeRemaining, TimerBadge }: QuestionHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-6 bg-white rounded-2xl p-4 border-4 border-black shadow-brutal">
      <div className="bg-black border-4 border-black shadow-brutal-sm px-4 py-2">
        <span className="text-white font-black text-xl uppercase">
          Câu {questionIndex + 1}/{totalQuestions}
        </span>
      </div>
      {TimerBadge}
    </div>
  );
}
