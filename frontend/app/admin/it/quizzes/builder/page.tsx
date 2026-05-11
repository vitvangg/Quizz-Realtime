"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Trash2, Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

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

export default function QuizBuilderPage() {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: "q1",
      content: "",
      timeLimit: 20,
      answers: [
        { id: "a1", content: "", isCorrect: true },
        { id: "a2", content: "", isCorrect: false },
      ],
    },
  ]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: Date.now().toString(),
        content: "",
        timeLimit: 20,
        answers: [
          { id: Date.now().toString() + "1", content: "", isCorrect: true },
          { id: Date.now().toString() + "2", content: "", isCorrect: false },
        ],
      },
    ]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, field: keyof Question, value: any) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const addAnswer = (questionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.answers.length < 4) {
          return {
            ...q,
            answers: [
              ...q.answers,
              { id: Date.now().toString(), content: "", isCorrect: false },
            ],
          };
        }
        return q;
      })
    );
  };

  const removeAnswer = (questionId: string, answerId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.answers.length > 2) {
          return {
            ...q,
            answers: q.answers.filter((a) => a.id !== answerId),
          };
        }
        return q;
      })
    );
  };

  const updateAnswer = (questionId: string, answerId: string, field: keyof Answer, value: any) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId) {
          return {
            ...q,
            answers: q.answers.map((a) => {
              if (a.id === answerId) {
                return { ...a, [field]: value };
              }
              // If we are setting one answer to correct, make others incorrect (Single Choice)
              if (field === "isCorrect" && value === true) {
                 return { ...a, isCorrect: false };
              }
              return a;
            }),
          };
        }
        return q;
      })
    );
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Vui lòng nhập tên Quiz!");
      return;
    }
    // TODO: Gửi data xuống backend API
    toast.success("Lưu Quiz thành công!");
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/quizzes">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quiz Builder</h1>
            <p className="text-muted-foreground">Soạn thảo bộ câu hỏi</p>
          </div>
        </div>
        <Button className="gap-2" onClick={handleSave}>
          <Save className="h-4 w-4" />
          Lưu Quiz
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-2">
            <Label htmlFor="title" className="text-base font-semibold">Tên bộ câu hỏi</Label>
            <Input
              id="title"
              placeholder="Nhập tên bộ câu hỏi..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-medium"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-8">
        {questions.map((q, index) => (
          <Card key={q.id} className="relative">
            <CardHeader className="pb-4 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Câu hỏi {index + 1}</CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`timeLimit-${q.id}`} className="text-sm text-muted-foreground">Thời gian (giây):</Label>
                    <Input
                      id={`timeLimit-${q.id}`}
                      type="number"
                      className="w-20 h-8"
                      value={q.timeLimit}
                      onChange={(e) => updateQuestion(q.id, "timeLimit", parseInt(e.target.value) || 20)}
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeQuestion(q.id)} disabled={questions.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <Label>Nội dung câu hỏi</Label>
                <Input
                  placeholder="Nhập nội dung câu hỏi..."
                  value={q.content}
                  onChange={(e) => updateQuestion(q.id, "content", e.target.value)}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Các đáp án (Đánh dấu tick vào đáp án đúng)</Label>
                  {q.answers.length < 4 && (
                    <Button variant="outline" size="sm" onClick={() => addAnswer(q.id)} className="gap-2 text-xs h-8">
                      <PlusCircle className="h-3 w-3" /> Thêm đáp án
                    </Button>
                  )}
                </div>
                
                <div className="grid gap-3 sm:grid-cols-2">
                  {q.answers.map((a, aIndex) => (
                    <div key={a.id} className={`flex items-center gap-2 rounded-md border p-2 ${a.isCorrect ? 'border-green-500 ring-1 ring-green-500/20 bg-green-50/50 dark:bg-green-900/10' : ''}`}>
                      <input
                        type="radio"
                        name={`correct-${q.id}`}
                        checked={a.isCorrect}
                        onChange={() => updateAnswer(q.id, a.id, "isCorrect", true)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-green-600"
                      />
                      <Input
                        placeholder={`Đáp án ${aIndex + 1}`}
                        value={a.content}
                        onChange={(e) => updateAnswer(q.id, a.id, "content", e.target.value)}
                        className={`h-9 border-0 shadow-none focus-visible:ring-0 ${a.isCorrect ? 'bg-transparent' : ''}`}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500" onClick={() => removeAnswer(q.id, a.id)} disabled={q.answers.length <= 2}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center">
        <Button variant="outline" size="lg" className="gap-2 w-full max-w-sm border-dashed border-2" onClick={addQuestion}>
          <PlusCircle className="h-5 w-5 text-muted-foreground" />
          Thêm câu hỏi mới
        </Button>
      </div>
    </div>
  );
}
