"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

import {
  PlusCircle,

  ArrowLeft,

  Info,
  FileDown,
  FileUp,
  FileText,
  Sparkles,

} from "lucide-react";

import Link from "next/link";
import { toast } from "sonner";

import { useQuizStore } from "@/stores/quiz.store";
import { useQuestionStore } from "@/stores/question.store";
import { useAnswerStore } from "@/stores/answer.store";

import { useAIStore } from "@/stores/ai.store";
import { AIComponent } from "@/components/quiz/ai-component";
import { QuestionCard } from "@/components/quiz/question-card";
import { QuizCategory, CATEGORY_LABELS } from "@/types/quiz.type";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Question, Answer } from "@/types/quiz.type";

export default function QuizBuilderPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<QuizCategory>(QuizCategory.KHAC);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);

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
      "Danh muc (TOAN|VAT_LI|HOA_HOC|SINH_HOC|VAN_HOC|LICH_SU|DIA_LY|TIENG_ANH|CONG_NGHE|KHAC)",
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
      "TOAN,1 + 1 bang bao nhieu?,20,2,1,3,0,4,0,5,0",
      "TIENG_ANH,What is 'Hello' in Vietnamese?,30,Xin chao,1,Tam biet,0,Cam on,0,Xin loi,0",
    ];

    const csvContent = "\uFEFF" + [headers.join(","), ...sampleData].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "quiz_template_with_category.csv");
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
      let detectedCategory: QuizCategory | null = null;

      // Bo qua header (dong 0)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(",");
        if (parts.length < 7) continue; // It nhat phai co Category, Content, Time, 2 Answers

        const categoryVal = parts[0].trim().toUpperCase();
        const content = parts[1];
        const timeLimit = parseInt(parts[2]) || 20;
        const answers: Answer[] = [];

        // Luu lai category tu dong hop le dau tien
        if (!detectedCategory && Object.values(QuizCategory).includes(categoryVal as QuizCategory)) {
          detectedCategory = categoryVal as QuizCategory;
        }

        // Duyet qua cac cap dap an (bat dau tu index 3)
        for (let j = 3; j < parts.length; j += 2) {
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
        // Cập nhật danh mục nếu tìm thấy
        if (detectedCategory) {
          setCategory(detectedCategory);
        }

        // Nếu chỉ có 1 câu hỏi và nó trống, thì thay thế bằng danh sách mới
        const isFirstQuestionEmpty = questions.length === 1 && !questions[0].content.trim();

        if (isFirstQuestionEmpty) {
          setQuestions(importedQuestions);
        } else {
          setQuestions([...questions, ...importedQuestions]);
        }

        toast.success(`Đã nhập thành công ${importedQuestions.length} câu hỏi${detectedCategory ? ` thuộc danh mục ${CATEGORY_LABELS[detectedCategory]}` : ""}!`);
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
    // 🔥 Nếu sửa timeLimit của câu đầu tiên
    // thì apply cho toàn bộ câu hỏi
    if (field === "timeLimit" && questions[0]?.id === id) {
      setQuestions((prev) =>
        prev.map((q) => ({
          ...q,
          timeLimit: value,
        }))
      );

      return;
    }

    // 🔥 Các trường hợp khác → update riêng
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, [field]: value } : q
      )
    );
  };

  // =========================
  // ANSWER
  // =========================

  const addAnswer = (questionId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
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
    setQuestions((prev) =>
      prev.map((q) => {
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
    setQuestions((prev) =>
      prev.map((q) => {
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

  const handleQuestionsGenerated = (data: { questions: Question[], category?: string }) => {
    const aiQuestions = data.questions;
    const isFirstQuestionEmpty =
      questions.length === 1 &&
      !questions[0].content.trim();

    if (isFirstQuestionEmpty) {
      setQuestions(aiQuestions);
    } else {
      setQuestions((prev) => [...prev, ...aiQuestions]);
    }

    // Default title to topic if title is empty
    const aiTopic = useAIStore.getState().topic;
    if (!title.trim() && aiTopic) {
      setTitle(aiTopic);
    }

    // Update category if returned
    if (data.category) {
      const cat = data.category.toUpperCase() as QuizCategory;
      if (Object.values(QuizCategory).includes(cat)) {
        setCategory(cat);
      }
    }

    setShowAI(false); // Đóng sau khi gen xong
  };

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
      const emptyAnswerIndex = questions[i].answers.findIndex(
        (a) => !a.content.trim()
      );

      if (emptyAnswerIndex !== -1) {
        toast.error(
          `Câu hỏi ${i + 1} đang thiếu nội dung đáp án ${emptyAnswerIndex + 1}!`
        );
        return;
      }
    }

    setSaving(true);

    try {
      const newQuiz = await quizStore.create({ title, category });
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

        if (q.pendingFile) {

          await questionStore.uploadImage(questionId, q.pendingFile);
        }

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-16 z-40 bg-background/90 backdrop-blur-xl py-6 px-4 md:px-8 border-b transition-all duration-300 rounded-3xl">
        <div className="flex items-center gap-5">
          <Link href="/quiz">
            <Button 
              variant="outline" 
              size="icon" 

              className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>

          <div>
            <h1 className="text-3xl font-black tracking-tighter">
              Trình tạo Quiz
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              Tạo những thử thách thú vị
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="gap-2 px-6 py-6 rounded-2xl border-2 font-black transition-all hover:bg-primary/5 active:scale-95"
            onClick={() => setShowAI(!showAI)}
          >
            <Sparkles className={`h-5 w-5 ${showAI ? 'text-primary' : ''}`} />
            {showAI ? "Đóng AI" : "Tạo bằng AI"}
          </Button>

          <Button
            className="gap-2 px-8 py-6 rounded-2xl shadow-xl shadow-primary/20 font-black text-lg transition-all hover:scale-105"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Đang lưu..." : "Xuất bản Quiz"}
          </Button>
        </div>
      </div>

      {/* AI COMPONENT (CONDITIONAL) */}
      {showAI && (
        <AIComponent onQuestionsGenerated={handleQuestionsGenerated} />
      )}

      {/* REMAINDER OF PAGE (HIDDEN WHEN AI IS SHOWING) */}
      {!showAI && (
        <>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="title" className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                      Tên bộ sưu tập
                    </Label>
                    <Input
                      id="title"
                      placeholder="Ví dụ: Lập trình React căn bản..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-2xl font-black py-8 border-2 border-transparent bg-white focus:border-primary/50 transition-all rounded-2xl placeholder:text-muted-foreground/30"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="category" className="text-sm font-black text-muted-foreground uppercase tracking-widest px-1">
                      Danh mục
                    </Label>
                    <Select value={category} onValueChange={(value) => setCategory(value as QuizCategory)}>
                      <SelectTrigger className="text-xl font-black py-8 border-2 border-transparent bg-white focus:border-primary/50 transition-all rounded-2xl h-14">
                        <SelectValue placeholder="Chọn danh mục" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-2">
                        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="py-3 font-bold rounded-xl">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
        </>
      )}
    </div>
  );
}