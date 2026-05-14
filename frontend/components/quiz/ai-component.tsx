"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { useAIStore } from "@/stores/ai.store";

interface AIComponentProps {
    onQuestionsGenerated: (data: { questions: any[], category?: string }) => void;
}

export function AIComponent({ onQuestionsGenerated }: AIComponentProps) {
    const { 
        loading, 
        topic, 
        amount, 
        requirements, 
        setTopic, 
        setAmount, 
        setRequirements, 
        generate 
    } = useAIStore();

    const handleGenerate = async () => {
        const data = await generate();
        if (data && data.questions && data.questions.length > 0) {
            const formattedQuestions = data.questions.map((q: any, qIndex: number) => ({
                id: `ai-q-${Date.now()}-${qIndex}`,
                content: q.content,
                timeLimit: q.timeLimit || 20,
                answers: q.answers.map((a: any, aIndex: number) => ({
                    id: `ai-a-${Date.now()}-${qIndex}-${aIndex}`,
                    content: a.content,
                    isCorrect: a.isCorrect,
                })),
            }));
            onQuestionsGenerated({ 
                questions: formattedQuestions, 
                category: data.category 
            });
        }
    };

    return (
        <section className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 px-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-black uppercase tracking-widest">
                    AI Generate
                </span>
            </div>

            <Card className="border-2 border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                        <Label>Chủ đề quiz</Label>
                        <Input
                            placeholder="Ví dụ: ReactJS cơ bản..."
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-1 space-y-2">
                            <Label>Số lượng</Label>
                            <Input
                                type="number"
                                min={1}
                                max={20}
                                value={amount}
                                onChange={(e) => setAmount(Number(e.target.value))}
                            />
                        </div>
                        <div className="md:col-span-3 space-y-2">
                            <Label>Yêu cầu thêm (Tùy chọn)</Label>
                            <textarea
                                placeholder="Ví dụ: Câu hỏi có độ khó cao, tập trung vào React Hooks..."
                                value={requirements}
                                onChange={(e) => setRequirements(e.target.value)}
                                className="flex min-h-[40px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="w-full gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.01]"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Đang generate...
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4" />
                                Generate bằng AI
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </section>
    );
}