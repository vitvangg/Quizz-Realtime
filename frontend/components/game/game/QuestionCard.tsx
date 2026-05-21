'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Target } from 'lucide-react';
import Image from 'next/image';

interface QuestionCardProps {
  content: string;
  imageUrl?: string;
  questionIndex: number;
  totalQuestions: number;
}

export function QuestionCard({ content, imageUrl, questionIndex, totalQuestions }: QuestionCardProps) {
  return (
    <Card className="mb-4 sm:mb-6 bg-white border-4 border-black shadow-brutal">
      {/* Image - shown BEFORE question content if present */}
      {imageUrl && (
        <CardContent className="p-2 sm:p-3 bg-white border-b-4 border-black">
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border-4 border-black">
            <Image
              src={imageUrl}
              alt="Question image"
              fill
              className="object-contain"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 640px"
              priority={questionIndex === 0}
            />
          </div>
        </CardContent>
      )}
      {/* Question content */}
      <CardHeader className="bg-neon-pink border-b-4 border-black pb-3 sm:pb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Target className="w-6 h-6 sm:w-8 sm:h-8 text-white flex-shrink-0" />
          <CardTitle className="text-lg sm:text-xl md:text-2xl font-black text-white text-center leading-relaxed flex-1">
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
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-4 sm:mb-6 bg-white rounded-2xl p-3 sm:p-4 border-4 border-black shadow-brutal">
      <div className="bg-black border-4 border-black shadow-brutal-sm px-3 sm:px-4 py-1 sm:py-2">
        <span className="text-white font-black text-base sm:text-xl uppercase">
          Câu {questionIndex + 1}/{totalQuestions}
        </span>
      </div>
      {TimerBadge}
    </div>
  );
}
