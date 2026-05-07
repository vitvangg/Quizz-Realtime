'use client';

import { useState } from 'react';
import { Play, Edit3, MoreVertical, Trash2, FileText } from 'lucide-react';
import type { Quiz } from '../../types/game';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface QuizCardProps {
  quiz: Quiz;
  onLiveHost?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isLoading?: boolean;
}

export function QuizCard({
  quiz,
  onLiveHost,
  onEdit,
  onDelete,
  isLoading = false,
}: QuizCardProps) {
  const questionCount = quiz.questions?.length ?? quiz.questionCount ?? 0;

  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate">{quiz.title}</CardTitle>
            {quiz.description && (
              <CardDescription className="line-clamp-2 mt-1">
                {quiz.description}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <MoreVertical className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit} disabled={isLoading}>
                <Edit3 className="size-4" />
                Edit Quiz
              </DropdownMenuItem>
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    variant="destructive"
                    disabled={isLoading}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="info" className="gap-1">
            <FileText className="size-3" />
            {questionCount} {questionCount === 1 ? 'question' : 'questions'}
          </Badge>
          {quiz.category && (
            <Badge variant="secondary">{quiz.category}</Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          onClick={onLiveHost}
          disabled={isLoading}
          className="w-full gap-2"
          size="sm"
        >
          <Play className="size-4" />
          {isLoading ? 'Creating Room...' : 'Live Host'}
        </Button>
      </CardFooter>
    </Card>
  );
}
