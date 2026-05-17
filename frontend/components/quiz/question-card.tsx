"use client";

import { useRef, useState, useEffect } from "react";
import {
  Trash2,
  PlusCircle,
  Clock,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Circle,
  Type,
  Camera,
  X,
  Loader2,
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
import Image from "next/image";

interface Answer {
  id: string;
  content: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  content: string;
  imageUrl?: string;
  imageId?: string;
  timeLimit: number;
  answers: Answer[];
  // Thêm trường để lưu file tạm thời ở client
  pendingFile?: File;
  previewUrl?: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("File đã chọn:", file);
    if (file && onUpdate) {
      const previewUrl = URL.createObjectURL(file);
      console.log("Preview URL:", previewUrl);
      onUpdate(question.id, "pendingFile" as any, file);
      onUpdate(question.id, "previewUrl" as any, previewUrl);
    }
  };

  const removeImage = () => {
    if (onUpdate) {
      onUpdate(question.id, "imageUrl", null);
      onUpdate(question.id, "imageId", null);
      onUpdate(question.id, "pendingFile" as any, null);
      onUpdate(question.id, "previewUrl" as any, null);
    }
  };

  // Hiển thị ảnh: Ưu tiên previewUrl (ảnh mới chọn) rồi mới đến imageUrl (ảnh cũ từ DB)
  const displayImage = question.previewUrl || question.imageUrl;

  return (
    <div className="group animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card
        className={`relative overflow-hidden border-2 transition-all ${readOnly ? "border-muted/40" : "hover:shadow-md border-muted/60 hover:border-primary/30"}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${readOnly ? "bg-muted-foreground/20" : "bg-primary/20 group-hover:bg-primary transition-colors"}`} />

        <CardHeader className={`pb-4 border-b ${readOnly ? "bg-muted/10" : "bg-muted/20"}`}>
          <div className="flex items-center justify-between gap-4">
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

            <div className="flex items-center gap-3">
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

        <CardContent className="pt-6 space-y-8">
          <div className="grid md:grid-cols-[1fr_200px] gap-6">
            <div className="space-y-3">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Nội dung câu hỏi
              </Label>
              {readOnly ? (
                <div className="w-full min-h-[100px] p-4 rounded-2xl bg-muted/20 border-2 border-transparent text-lg font-medium">
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
                  className="w-full min-h-[100px] p-4 rounded-2xl bg-muted/30 border-2 border-transparent focus:border-primary/50 focus:bg-background transition-all outline-none text-lg font-medium resize-none"
                />
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Hình ảnh
              </Label>
              <div
                className={`
                  relative 
                  aspect-square 
                  rounded-2xl 
                  border-2 
                  border-dashed 
                  flex 
                  items-center 
                  justify-center 
                  overflow-hidden 
                  transition-all
                  ${displayImage ? "border-transparent bg-muted" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5"}
                  ${readOnly && !displayImage ? "hidden" : ""}
                `}
              >
                {displayImage ? (
                  <>
                    <Image
                      src={displayImage}
                      alt="Question"
                      fill
                      className="object-cover"
                      unoptimized={!!question.previewUrl} // Quan trọng để hiển thị Blob URL
                    />
                    {!readOnly && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="rounded-full h-9 w-9"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="rounded-full h-9 w-9"
                          onClick={removeImage}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  !readOnly && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Camera className="h-8 w-8" />
                      <span className="text-[10px] font-bold uppercase">Tải ảnh</span>
                    </button>
                  )
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>

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

            <div className="grid gap-4 sm:grid-cols-2">
              {question.answers.map((a, aIndex) => (
                <div
                  key={a.id}
                  onClick={() => {
                    if (!readOnly && onUpdateAnswer) {
                      onUpdateAnswer(question.id, a.id, 'isCorrect', true);
                    }
                  }}
                  className={`group/answer relative flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${a.isCorrect ? "border-green-500 bg-green-50/50 shadow-sm" : "border-muted-foreground/10 bg-muted/20 hover:border-primary/30"} ${!readOnly ? "cursor-pointer" : ""}`}
                >
                  <div className={`shrink-0 transition-transform ${a.isCorrect ? "text-green-600 scale-110" : "text-muted-foreground/30"}`}>
                    {a.isCorrect ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                  </div>
                  {readOnly ? (
                    <span className={`font-bold ${a.isCorrect ? "text-green-800" : ""}`}>{a.content}</span>
                  ) : (
                    <Input
                      placeholder={`Đáp án ${aIndex + 1}...`}
                      value={a.content}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateAnswer?.(question.id, a.id, "content", e.target.value)}
                      className={`border-0 bg-transparent shadow-none focus-visible:ring-0 font-bold p-0 ${a.isCorrect ? "text-green-800" : ""}`}
                    />
                  )}
                  {!readOnly && question.answers.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover/answer:opacity-100 h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveAnswer?.(question.id, a.id);
                      }}
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
