export interface Quiz {
  id: string;
  title: string;
  description?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  questions?: Question[];
}

export interface Question {
  id: string;
  quizId: string;
  content: string;
  timeLimit: number;
  orderIndex: number;
  answers?: Answer[];
}

export interface Answer {
  id: string;
  questionId: string;
  content: string;
  isCorrect: boolean;
}

export interface CreateQuizDto {
  title: string;
  description?: string;
}

export interface CreateQuestionDto {
  quizId: string;
  content: string;
  timeLimit: number;
  orderIndex: number;
}

export interface CreateAnswerDto {
  questionId: string;
  content: string;
  isCorrect: boolean;
}
