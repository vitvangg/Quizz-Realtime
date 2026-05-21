"use client";

import { useState, useRef, useEffect } from "react";
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
import {
  QuizCategory,
  CATEGORY_LABELS,
  Question,
  Answer,
} from "@/types/quiz.type";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function QuizBuilderPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeQuestion, setActiveQuestion] = useState("");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<QuizCategory>(
    QuizCategory.KHAC
  );

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

  // =========================================
  // ACTIVE QUESTION DETECTION
  // =========================================

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveQuestion(entry.target.id);
          }
        });
      },
      {
        threshold: 0.4,
      }
    );

    questions.forEach((q) => {
      const el = questionRefs.current[q.id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [questions]);

  const scrollToQuestion = (id: string) => {
    questionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  // =========================================
  // TEMPLATE & IMPORT
  // =========================================

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

    const csvContent =
      "\uFEFF" + [headers.join(","), ...sampleData].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      "quiz_template_with_category.csv"
    );

    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };

    reader.readAsText(file);

    if (fileInputRef.current)
      fileInputRef.current.value = "";
  };

  const parseCSV = (text: string) => {
    try {
      const lines = text.split("\n");

      const importedQuestions: Question[] = [];

      let detectedCategory: QuizCategory | null = null;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) continue;

        const parts = line.split(",");

        if (parts.length < 7) continue;

        const categoryVal = parts[0]
          .trim()
          .toUpperCase();

        const content = parts[1];

        const timeLimit = parseInt(parts[2]) || 20;

        const answers: Answer[] = [];

        if (
          !detectedCategory &&
          Object.values(QuizCategory).includes(
            categoryVal as QuizCategory
          )
        ) {
          detectedCategory =
            categoryVal as QuizCategory;
        }

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
        if (detectedCategory) {
          setCategory(detectedCategory);
        }

        const isFirstQuestionEmpty =
          questions.length === 1 &&
          !questions[0].content.trim();

        if (isFirstQuestionEmpty) {
          setQuestions(importedQuestions);
        } else {
          setQuestions([
            ...questions,
            ...importedQuestions,
          ]);
        }

        toast.success(
          `Đã nhập ${importedQuestions.length} câu hỏi!`
        );
      } else {
        toast.error(
          "Không tìm thấy dữ liệu hợp lệ."
        );
      }
    } catch (error) {
      console.error(error);

      toast.error(
        "Lỗi khi đọc file CSV."
      );
    }
  };

  // =========================================
  // QUESTION ORDER
  // =========================================

  const moveQuestion = (
    index: number,
    direction: "up" | "down"
  ) => {
    const newIndex =
      direction === "up"
        ? index - 1
        : index + 1;

    if (
      newIndex < 0 ||
      newIndex >= questions.length
    )
      return;

    const newQuestions = [...questions];

    const [movedItem] = newQuestions.splice(
      index,
      1
    );

    newQuestions.splice(
      newIndex,
      0,
      movedItem
    );

    setQuestions(newQuestions);
  };

  // =========================================
  // QUESTION
  // =========================================

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id:
          "q-" +
          Date.now() +
          Math.random(),

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

    setQuestions(
      questions.filter((q) => q.id !== id)
    );
  };

  const updateQuestion = (
    id: string,
    field: keyof Question,
    value: any
  ) => {
    if (
      field === "timeLimit" &&
      questions[0]?.id === id
    ) {
      setQuestions((prev) =>
        prev.map((q) => ({
          ...q,
          timeLimit: value,
        }))
      );

      return;
    }

    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, [field]: value }
          : q
      )
    );
  };

  // =========================================
  // ANSWER
  // =========================================

  const addAnswer = (questionId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (
          q.id === questionId &&
          q.answers.length < 4
        ) {
          return {
            ...q,
            answers: [
              ...q.answers,
              {
                id:
                  "a-" +
                  Date.now() +
                  Math.random(),

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
        if (
          q.id === questionId &&
          q.answers.length > 2
        ) {
          const newAnswers =
            q.answers.filter(
              (a) => a.id !== answerId
            );

          if (
            q.answers.find(
              (a) => a.id === answerId
            )?.isCorrect
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
                return {
                  ...a,
                  [field]: value,
                };
              }

              if (
                field === "isCorrect" &&
                value === true
              ) {
                return {
                  ...a,
                  isCorrect: false,
                };
              }

              return a;
            }),
          };
        }

        return q;
      })
    );
  };

  // =========================================
  // AI
  // =========================================

  const handleQuestionsGenerated = (
    data: {
      questions: Question[];
      category?: string;
    }
  ) => {
    const aiQuestions = data.questions;

    const isFirstQuestionEmpty =
      questions.length === 1 &&
      !questions[0].content.trim();

    if (isFirstQuestionEmpty) {
      setQuestions(aiQuestions);
    } else {
      setQuestions((prev) => [
        ...prev,
        ...aiQuestions,
      ]);
    }

    const aiTopic =
      useAIStore.getState().topic;

    if (!title.trim() && aiTopic) {
      setTitle(aiTopic);
    }

    if (data.category) {
      const cat =
        data.category.toUpperCase() as QuizCategory;

      if (
        Object.values(QuizCategory).includes(
          cat
        )
      ) {
        setCategory(cat);
      }
    }

    setShowAI(false);
  };

  // =========================================
  // SAVE
  // =========================================

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(
        "Vui lòng nhập tên Quiz!"
      );

      return;
    }

    for (
      let i = 0;
      i < questions.length;
      i++
    ) {
      if (
        !questions[i].content.trim()
      ) {
        toast.error(
          `Câu hỏi ${i + 1} chưa có nội dung!`
        );

        return;
      }

      const hasCorrect =
        questions[i].answers.some(
          (a) => a.isCorrect
        );

      if (!hasCorrect) {
        toast.error(
          `Câu hỏi ${i + 1} chưa có đáp án đúng!`
        );

        return;
      }
    }

    setSaving(true);

    try {
      const newQuiz =
        await quizStore.create({
          title,
          category,
        });

      const quizId = newQuiz.id;

      for (
        let i = 0;
        i < questions.length;
        i++
      ) {
        const q = questions[i];

        const newQuestion =
          await questionStore.create({
            quizId,
            content: q.content,
            timeLimit: q.timeLimit,
            orderIndex: i,
          });

        const questionId =
          newQuestion.id;

        if (q.pendingFile) {
          await questionStore.uploadImage(
            questionId,
            q.pendingFile
          );
        }

        for (const a of q.answers) {
          await answerStore.create({
            questionId,
            content: a.content,
            isCorrect: a.isCorrect,
          });
        }
      }

      toast.success(
        "Tạo Quiz thành công!"
      );

      router.push("/quiz");
    } catch (error: any) {
      console.error(error);

      const message =
        error.response?.data?.message ||
        "Có lỗi xảy ra.";

      toast.error(
        Array.isArray(message)
          ? message.join(", ")
          : message
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* APP BAR STICKY */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-black tracking-tight">Trình tạo Quiz</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* LEFT CONTENT */}
        <div className="flex-1 min-w-0 space-y-12 pb-32">
          {/* HIDDEN INPUT */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv"
            className="hidden"
          />



          {/* AI */}
          {showAI && (
            <AIComponent
              onQuestionsGenerated={
                handleQuestionsGenerated
              }
            />
          )}

          {/* IMPORT */}
          {!showAI && (
            <>


              {/* QUIZ INFO */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 px-2 text-primary">
                  <Info className="h-4 w-4" />

                  <span className="text-xs font-black uppercase tracking-widest">
                    Thông tin cơ bản
                  </span>
                </div>

                <Card>
                  <CardContent className="pt-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Label>
                          Tên Quiz
                        </Label>

                        <Input
                          placeholder="Ví dụ: React cơ bản..."
                          value={title}
                          onChange={(e) =>
                            setTitle(
                              e.target.value
                            )
                          }
                          className="rounded-2xl h-14"
                        />
                      </div>

                      <div className="space-y-3">
                        <Label>
                          Danh mục
                        </Label>

                        <Select
                          value={category}
                          onValueChange={(
                            value
                          ) =>
                            setCategory(
                              value as QuizCategory
                            )
                          }
                        >
                          <SelectTrigger className="rounded-2xl h-14">
                            <SelectValue placeholder="Chọn danh mục" />
                          </SelectTrigger>

                          <SelectContent>
                            {Object.entries(
                              CATEGORY_LABELS
                            ).map(
                              ([
                                value,
                                label,
                              ]) => (
                                <SelectItem
                                  key={value}
                                  value={value}
                                >
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* QUESTIONS */}
              <section className="space-y-8">
                {questions.map(
                  (q, index) => (
                    <div
                      key={q.id}
                      id={q.id}
                      ref={(el) => {
                        questionRefs.current[
                          q.id
                        ] = el;
                      }}
                    >
                      <QuestionCard
                        question={q}
                        index={index}
                        totalQuestions={
                          questions.length
                        }
                        onUpdate={
                          updateQuestion
                        }
                        onRemove={
                          removeQuestion
                        }
                        onUpdateAnswer={
                          updateAnswer
                        }
                        onAddAnswer={
                          addAnswer
                        }
                        onRemoveAnswer={
                          removeAnswer
                        }
                        onMove={
                          moveQuestion
                        }
                        canRemove={
                          questions.length > 1
                        }
                      />
                    </div>
                  )
                )}
              </section>

              {/* ADD QUESTION */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  className="w-full max-w-lg py-10 rounded-3xl border-dashed text-xl font-black"
                  onClick={addQuestion}
                >
                  <PlusCircle className="w-6 h-6 mr-2" />
                  Thêm câu hỏi
                </Button>
              </div>
            </>
          )}
        </div>

        {/* RIGHT NAVBAR */}
        <div className="hidden lg:flex flex-col sticky top-24 space-y-4 self-start max-h-[calc(100vh-8rem)]">
          {/* QUIZ SUMMARY */}
          <Card className="rounded-3xl border-2 shrink-0">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-2xl font-black">
                  {title || "Quiz chưa có tên"}
                </h2>

                <p className="text-sm text-muted-foreground mt-1">
                  {questions.length} câu hỏi
                </p>
              </div>

              {/* ACTIONS */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="w-full rounded-xl justify-center h-10 text-xs px-2"
                  onClick={downloadTemplate}
                >
                  <FileDown className="w-3.5 h-3.5 mr-1" />
                  File Mẫu
                </Button>

                <Button
                  variant="outline"
                  className="w-full rounded-xl justify-center h-10 text-xs px-2"
                  onClick={handleImportClick}
                >
                  <FileUp className="w-3.5 h-3.5 mr-1" />
                  Nhập File
                </Button>

                <Button
                  variant="outline"
                  className="col-span-2 w-full rounded-xl justify-center h-10 text-sm"
                  onClick={() => setShowAI(!showAI)}
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {showAI ? "Đóng AI" : "Tạo bằng AI"}
                </Button>
              </div>

              <Button
                className="w-full rounded-2xl h-12 font-black"
                onClick={handleSave}
                disabled={saving}
              >
                {saving
                  ? "Đang lưu..."
                  : "Xuất bản Quiz"}
              </Button>
            </CardContent>
          </Card>

          {/* QUESTION NAV */}
          <Card className="rounded-3xl border-2 flex-1 min-h-0 flex flex-col">
            <CardContent className="p-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-2">
                {questions.map(
                  (q, index) => {
                    const isActive =
                      activeQuestion ===
                      q.id;

                    return (
                      <button
                        key={q.id}
                        onClick={() =>
                          scrollToQuestion(
                            q.id
                          )
                        }
                        className={`
                        w-full
                        text-left
                        p-4
                        rounded-2xl
                        border-2
                        transition-all
                        ${isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted border-transparent"
                          }
                      `}
                      >
                        <div className="font-black">
                          Câu{" "}
                          {index + 1}
                        </div>

                        <div className="text-xs opacity-70 line-clamp-2 mt-1">
                          {q.content ||
                            "Chưa có nội dung"}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}