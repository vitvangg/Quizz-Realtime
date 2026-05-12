"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

import {
  PlusCircle,
  Save,
  ArrowLeft,
  LayoutGrid,
  Info,
  FileDown,
  FileUp,
  FileText,
} from "lucide-react";

import Link from "next/link";
import { toast } from "sonner";

import { useQuizStore } from "@/stores/quiz.store";
import { useQuestionStore } from "@/stores/question.store";
import { useAnswerStore } from "@/stores/answer.store";

import { QuestionCard } from "@/components/quiz/question-card";

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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const quizStore = useQuizStore();
  const questionStore = useQuestionStore();
  const answerStore = useAnswerStore();

  const [questions, setQuestions] = useState<Question[]>([
    {
      id: "q-" + Date.now(),
      content: "",
      timeLimit: 20,
      answers: [
        {
          id: "a1-" + Date.now(),
          content: "",
          isCorrect: true,
        },
        {
          id: "a2-" + Date.now(),
          content: "",
          isCorrect: false,
        },
      ],
    },
  ]);

  // =========================
  // TEMPLATE & IMPORT
  // =========================

  const downloadTemplate = () => {
    const headers = [
      "Noi dung cau hoi",
      "Thoi gian (giay)",
      "Dap an 1",
      "Dap an 1 dung (1) hoac sai (0)",
      "Dap an 2",
      "Dap an 2 dung (1) hoac sai (0)",
      "Dap an 3",
      "Dap an 3 dung (1) hoac sai (0)",
      "Dap an 4",
      "Dap an 4 dung (1) hoac sai (0)",
    ];

    const sampleData = [
      "Thu do cua Viet Nam la gi?,20,Ha Noi,1,TP Ho Chi Minh,0,Da Nang,0,Hue,0",
      "React la gi?,30,Mot thu vien JS,1,Mot framework CSS,0,Mot ngon ngu lap trinh,0,Mot he quan tri CSDL,0",
    ];

    const csvContent = "\uFEFF" + [headers.join(","), ...sampleData].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "quiz_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parseCSV = (text: string) => {
    try {
      const lines = text.split("\n");
      const importedQuestions: Question[] = [];

      // Bo qua header (dong 0)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(",");
        if (parts.length < 6) continue; // It nhat phai co 2 dap an

        const content = parts[0];
        const timeLimit = parseInt(parts[1]) || 20;
        const answers: Answer[] = [];

        // Duyet qua cac cap dap an (bat dau tu index 2)
        for (let j = 2; j < parts.length; j += 2) {
          if (parts[j]) {
            answers.push({
              id: `a-${Date.now()}-${i}-${j}`,
              content: parts[j],
              isCorrect: parts[j + 1] === "1",
            });
          }
        }

        if (content && answers.length >= 2) {
          importedQuestions.push({
            id: `q-${Date.now()}-${i}`,
            content,
            timeLimit,
            answers,
          });
        }
      }

      if (importedQuestions.length > 0) {
        setQuestions([...questions, ...importedQuestions]);
        toast.success(`Đã nhập thành công ${importedQuestions.length} câu hỏi!`);
      } else {
        toast.error("Không tìm thấy dữ liệu hợp lệ trong file.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi đọc file CSV. Vui lòng kiểm tra lại định dạng.");
    }
  };

  // =========================
  // ORDERING
  // =========================

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    const newQuestions = [...questions];
    const [movedItem] = newQuestions.splice(index, 1);
    newQuestions.splice(newIndex, 0, movedItem);

    setQuestions(newQuestions);
  };

  // =========================
  // QUESTION
  // =========================

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: "q-" + Date.now() + Math.random(),
        content: "",
        timeLimit: 20,
        answers: [
          {
            id: "a1-" + Date.now(),
            content: "",
            isCorrect: true,
          },
          {
            id: "a2-" + Date.now(),
            content: "",
            isCorrect: false,
          },
        ],
      },
    ]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const updateQuestion = (
    id: string,
    field: keyof Question,
    value: any
  ) => {
    setQuestions(
      questions.map((q) =>
        q.id === id ? { ...q, [field]: value } : q
      )
    );
  };

  // =========================
  // ANSWER
  // =========================

  const addAnswer = (questionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.answers.length < 4) {
          return {
            ...q,
            answers: [
              ...q.answers,
              {
                id: "a-" + Date.now() + Math.random(),
                content: "",
                isCorrect: false,
              },
            ],
          };
        }
        return q;
      })
    );
  };

  const removeAnswer = (
    questionId: string,
    answerId: string
  ) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.answers.length > 2) {
          const newAnswers = q.answers.filter(
            (a) => a.id !== answerId
          );

          if (
            q.answers.find((a) => a.id === answerId)?.isCorrect
          ) {
            newAnswers[0].isCorrect = true;
          }

          return {
            ...q,
            answers: newAnswers,
          };
        }
        return q;
      })
    );
  };

  const updateAnswer = (
    questionId: string,
    answerId: string,
    field: keyof Answer,
    value: any
  ) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId) {
          return {
            ...q,
            answers: q.answers.map((a) => {
              if (a.id === answerId) {
                return { ...a, [field]: value };
              }
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

  // =========================
  // SAVE
  // =========================

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Vui lòng nhập tên Quiz!");
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].content.trim()) {
        toast.error(`Câu hỏi ${i + 1} chưa có nội dung!`);
        return;
      }
      const hasCorrect = questions[i].answers.some((a) => a.isCorrect);
      if (!hasCorrect) {
        toast.error(`Câu hỏi ${i + 1} chưa chọn đáp án đúng!`);
        return;
      }
      const hasEmptyAnswer = questions[i].answers.some((a) => !a.content.trim());
      if (hasEmptyAnswer) {
        toast.error(`Câu hỏi ${i + 1} có đáp án trống!`);
        return;
      }
    }

    setSaving(true);

    try {
      const newQuiz = await quizStore.create({ title });
      const quizId = newQuiz.id;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const newQuestion = await questionStore.create({
          quizId,
          content: q.content,
          timeLimit: q.timeLimit,
          orderIndex: i,
        });
        const questionId = newQuestion.id;
        for (const a of q.answers) {
          await answerStore.create({
            questionId,
            content: a.content,
            isCorrect: a.isCorrect,
          });
        }
      }
      toast.success("Tạo trọn bộ Quiz thành công!");
      router.push("/quiz");
    } catch (error: any) {
      console.error(error);
      const message = error.response?.data?.message || "Có lỗi xảy ra khi lưu Quiz.";
      toast.error(Array.isArray(message) ? message.join(", ") : message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-12 pb-32">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-16 z-40 bg-background/90 backdrop-blur-xl py-6 border-b transition-all duration-300">
        <div className="flex items-center gap-5">
          <Link href="/quiz">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-2xl bg-muted hover:bg-primary hover:text-white transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>

          <div>
            <h1 className="text-3xl font-black tracking-tighter">
              Trình tạo Quiz
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <LayoutGrid className="h-4 w-4 text-primary" />
              Tạo những thử thách thú vị
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">

          <Button
            className="gap-2 px-8 py-6 rounded-2xl shadow-xl shadow-primary/20 font-black text-lg transition-all hover:scale-105"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-5 w-5" />
            {saving ? "Đang lưu..." : "Xuất bản Quiz"}
          </Button>
        </div>
      </div>

      {/* QUICK ACTIONS / IMPORT */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-2 border-dashed border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group" onClick={downloadTemplate}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="bg-primary/20 p-3 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all">
              <FileDown className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold">Tải File Mẫu</h3>
              <p className="text-xs text-muted-foreground">Download template CSV chuẩn</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-colors cursor-pointer group" onClick={handleImportClick}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="bg-green-500/20 p-3 rounded-2xl group-hover:bg-green-500 group-hover:text-white transition-all">
              <FileUp className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold">Nhập từ File</h3>
              <p className="text-xs text-muted-foreground">Import câu hỏi hàng loạt</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* QUIZ INFO SECTION */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-2 text-primary">
          <Info className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-widest">Thông tin cơ bản</span>
        </div>
        <Card className="border-2 border-primary/10 shadow-sm bg-gradient-to-br from-background to-muted/30 overflow-hidden">
          <CardContent className="pt-8">
            <div className="space-y-3">
              <Label htmlFor="title" className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                Tên bộ sưu tập
              </Label>
              <Input
                id="title"
                placeholder="Ví dụ: Lập trình React căn bản..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-black py-8 border-2 border-transparent bg-background focus:border-primary/50 transition-all rounded-2xl placeholder:text-muted-foreground/30"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* QUESTIONS LIST */}
      <section className="space-y-10">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-primary">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">Danh sách câu hỏi ({questions.length})</span>
          </div>
        </div>

        <div className="space-y-8">
          {questions.map((q, index) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={index}
              totalQuestions={questions.length}
              onUpdate={updateQuestion}
              onRemove={removeQuestion}
              onUpdateAnswer={updateAnswer}
              onAddAnswer={addAnswer}
              onRemoveAnswer={removeAnswer}
              onMove={moveQuestion}
              canRemove={questions.length > 1}
            />
          ))}
        </div>
      </section>

      {/* ADD QUESTION BUTTON */}
      <div className="flex justify-center pt-8">
        <Button
          variant="outline"
          className="
            group
            gap-3 
            w-full 
            max-w-lg 
            border-dashed 
            border-2 
            py-12 
            text-xl 
            font-black 
            rounded-3xl
            hover:border-primary/50
            hover:bg-primary/5
            hover:text-primary
            transition-all
            duration-300
          "
          onClick={addQuestion}
          disabled={saving}
        >
          <div className="bg-primary/10 p-2 rounded-xl group-hover:bg-primary group-hover:text-white transition-colors">
            <PlusCircle className="h-8 w-8" />
          </div>
          Thêm câu hỏi tiếp theo
        </Button>
      </div>
    </div>
  );
}