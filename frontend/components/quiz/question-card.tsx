"use client";

import {
  Trash2,
  PlusCircle,
  Clock,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Circle,
  Type,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  totalQuestions: number;

  onUpdate?: (
    id: string,
    field: keyof Question,
    value: any
  ) => void;

  onRemove?: (id: string) => void;

  onUpdateAnswer?: (
    questionId: string,
    answerId: string,
    field: keyof Answer,
    value: any
  ) => void;

  onAddAnswer?: (questionId: string) => void;

  onRemoveAnswer?: (
    questionId: string,
    answerId: string
  ) => void;

  onMove?: (index: number, direction: 'up' | 'down') => void;
  canRemove?: boolean;
  readOnly?: boolean;
}

export function QuestionCard({
  question,
  index,
  totalQuestions,
  onUpdate,
  onRemove,
  onUpdateAnswer,
  onAddAnswer,
  onRemoveAnswer,
  onMove,
  canRemove,
  readOnly = false,
}: QuestionCardProps) {

  return (
    <div className="group animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card
        className={`relative overflow-hidden border-2 transition-all ${readOnly ? "border-muted/40" : "hover:shadow-md border-muted/60 hover:border-primary/30"}`}
      >
        {/* Decorative Side Bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${readOnly ? "bg-muted-foreground/20" : "bg-primary/20 group-hover:bg-primary transition-colors"}`} />

        {/* HEADER */}
        <CardHeader className={`pb-4 border-b ${readOnly ? "bg-muted/10" : "bg-muted/20"}`}>
          <div className="flex items-center justify-between gap-4">

            {/* LEFT: Index & Controls */}
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1">
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary"
                    disabled={index === 0}
                    onClick={() => onMove?.(index, 'up')}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                )}
                <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${readOnly ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"} font-black text-sm shadow-sm`}>
                  {index + 1}
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary"
                    disabled={index === totalQuestions - 1}
                    onClick={() => onMove?.(index, 'down')}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <CardTitle className="text-lg font-bold flex items-center gap-2">
                {readOnly ? "Chi tiết câu hỏi" : "Thiết lập câu hỏi"}
              </CardTitle>
            </div>

            {/* RIGHT: Settings & Actions */}
            <div className="flex items-center gap-3">
              {/* TIME SETTING */}
              <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-xl border-2 shadow-sm focus-within:border-primary transition-colors">
                <Clock className="h-4 w-4 text-primary" />
                {readOnly ? (
                  <span className="w-12 text-center font-bold text-sm">{question.timeLimit}</span>
                ) : (
                  <Input
                    type="number"
                    className="w-12 h-6 border-0 focus-visible:ring-0 p-0 text-center font-bold text-sm"
                    value={question.timeLimit}
                    onChange={(e) =>
                      onUpdate?.(
                        question.id,
                        "timeLimit",
                        parseInt(e.target.value) || 20
                      )
                    }
                  />
                )}
                <span className="text-[10px] font-bold text-muted-foreground uppercase">giây</span>
              </div>

              {/* DELETE QUESTION */}
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => onRemove?.(question.id)}
                  disabled={!canRemove}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* CONTENT */}
        <CardContent className="pt-6 space-y-8">

          {/* QUESTION TEXT */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">

              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Nội dung câu hỏi
              </Label>
            </div>

            {readOnly ? (
              <div className="w-full min-h-[80px] p-4 rounded-2xl bg-muted/20 border-2 border-transparent text-lg font-medium">
                {question.content}
              </div>
            ) : (
              <textarea
                placeholder="Nhập câu hỏi của bạn tại đây..."
                value={question.content}
                onChange={(e) =>
                  onUpdate?.(
                    question.id,
                    "content",
                    e.target.value
                  )
                }
                className="
                  w-full
                  min-h-[100px]
                  p-4
                  rounded-2xl
                  bg-muted/30
                  border-2
                  border-transparent
                  focus:border-primary/50
                  focus:bg-background
                  transition-all
                  outline-none
                  text-lg
                  font-medium
                  resize-none
                "
              />
            )}
          </div>

          {/* ANSWERS SECTION */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Các phương án trả lời
              </Label>

              {!readOnly && question.answers.length < 4 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddAnswer?.(question.id)}
                  className="gap-2 rounded-full border-primary/20 text-primary hover:bg-primary/5 h-8"
                >
                  <PlusCircle className="h-3 w-3" />
                  Thêm đáp án
                </Button>
              )}
            </div>

            {/* ANSWER GRID */}
            <div className="grid gap-4 sm:grid-cols-2">
              {question.answers.map((a, aIndex) => (
                <div
                    key={a.id}
  onClick={() => {
    if (!readOnly && onUpdateAnswer) {
      onUpdateAnswer(question.id, a.id, 'isCorrect', true);
    }
  }}
  className={`
    group/answer
    relative
    flex
    items-center
    gap-3
    rounded-2xl
    border-2
    p-4
    transition-all
    ${a.isCorrect
      ? "border-green-500 bg-green-50/50 shadow-sm"
      : "border-muted-foreground/10 bg-muted/20 hover:border-primary/30"
    }
    ${!readOnly ? "cursor-pointer" : ""}
  `}
>
  {/* CORRECT SELECTOR */}
  <div
    className={`
      shrink-0
      transition-transform
      ${a.isCorrect ? "text-green-600 scale-110" : "text-muted-foreground/30"}
    `}
  >
    {a.isCorrect ? (
      <CheckCircle2 className="h-6 w-6" />
    ) : (
      <Circle className="h-6 w-6" />
    )}
  </div>

  {/* INPUT */}
  {readOnly ? (
    <span className={`font-bold ${a.isCorrect ? "text-green-800" : ""}`}>
      {a.content}
    </span>
  ) : (
    <Input
      placeholder={`Đáp án ${aIndex + 1}...`}
      value={a.content}
      onChange={(e) =>
        onUpdateAnswer?.(
          question.id,
          a.id,
          "content",
          e.target.value
        )
      }
      className={`
        border-0
        bg-transparent
        shadow-none
        focus-visible:ring-0
        font-bold
        p-0
        ${a.isCorrect ? "text-green-800" : ""}
      `}
    />
  )}

  {/* REMOVE ANSWER */}
  {!readOnly && question.answers.length > 2 && (
    <Button
      variant="ghost"
      size="icon"
      className="
        opacity-0
        group-hover/answer:opacity-100
        h-8
        w-8
        rounded-full
        hover:bg-destructive/10
        hover:text-destructive
        transition-all
      "
      onClick={() =>
        onRemoveAnswer?.(question.id, a.id)
      }
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )}
</div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}