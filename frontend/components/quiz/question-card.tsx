"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, PlusCircle, Clock } from "lucide-react";

interface Answer {
  id: string;
  content: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  content: string;
  timeLimit: number;
  answers: Answer[];
}

interface QuestionCardProps {
  question: Question;
  index: number;
  onUpdate: (id: string, field: keyof Question, value: any) => void;
  onRemove: (id: string) => void;
  onUpdateAnswer: (questionId: string, answerId: string, field: keyof Answer, value: any) => void;
  onAddAnswer: (questionId: string) => void;
  onRemoveAnswer: (questionId: string, answerId: string) => void;
  canRemove: boolean;
}

export function QuestionCard({
  question,
  index,
  onUpdate,
  onRemove,
  onUpdateAnswer,
  onAddAnswer,
  onRemoveAnswer,
  canRemove
}: QuestionCardProps) {
  return (
    <Card className="relative overflow-hidden border-2 transition-all hover:border-primary/20">
      <CardHeader className="pb-4 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm">
              {index + 1}
            </span>
            Câu hỏi
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-background px-3 py-1 rounded-md border shadow-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor={`timeLimit-${question.id}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Giây:
              </Label>
              <Input
                id={`timeLimit-${question.id}`}
                type="number"
                className="w-16 h-7 border-0 focus-visible:ring-0 text-center font-bold"
                value={question.timeLimit}
                onChange={(e) => onUpdate(question.id, "timeLimit", parseInt(e.target.value) || 20)}
              />
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-destructive hover:text-destructive hover:bg-destructive/10" 
              onClick={() => onRemove(question.id)} 
              disabled={!canRemove}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-muted-foreground">Nội dung câu hỏi</Label>
          <Input
            placeholder="Ví dụ: Thủ đô của Việt Nam là gì?"
            value={question.content}
            onChange={(e) => onUpdate(question.id, "content", e.target.value)}
            className="text-base py-6 border-2 focus-visible:border-primary"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-muted-foreground">
              Các phương án trả lời <span className="text-xs font-normal">(Chọn một đáp án đúng)</span>
            </Label>
            {question.answers.length < 4 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onAddAnswer(question.id)} 
                className="gap-2 text-xs h-8 border-dashed"
              >
                <PlusCircle className="h-3 w-3" /> Thêm phương án
              </Button>
            )}
          </div>
          
          <div className="grid gap-3 sm:grid-cols-2">
            {question.answers.map((a, aIndex) => (
              <div 
                key={a.id} 
                className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${
                  a.isCorrect 
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/10' 
                  : 'border-transparent bg-muted/50 hover:bg-muted'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={a.isCorrect}
                    onChange={() => onUpdateAnswer(question.id, a.id, "isCorrect", true)}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-green-600"
                  />
                </div>
                <Input
                  placeholder={`Phương án ${aIndex + 1}`}
                  value={a.content}
                  onChange={(e) => onUpdateAnswer(question.id, a.id, "content", e.target.value)}
                  className={`h-10 border-0 shadow-none focus-visible:ring-0 font-medium ${
                    a.isCorrect ? 'bg-transparent text-green-700 dark:text-green-400' : 'bg-transparent'
                  }`}
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" 
                  onClick={() => onRemoveAnswer(question.id, a.id)} 
                  disabled={question.answers.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
