export enum QuizCategory {
  TOAN = 'TOAN',
  VAT_LI = 'VAT_LI',
  HOA_HOC = 'HOA_HOC',
  SINH_HOC = 'SINH_HOC',
  VAN_HOC = 'VAN_HOC',
  LICH_SU = 'LICH_SU',
  DIA_LY = 'DIA_LY',
  TIENG_ANH = 'TIENG_ANH',
  CONG_NGHE = 'CONG_NGHE',
  KHAC = 'KHAC',
}

export const CATEGORY_LABELS: Record<QuizCategory, string> = {
  [QuizCategory.TOAN]: 'Toán học',
  [QuizCategory.VAT_LI]: 'Vật lý',
  [QuizCategory.HOA_HOC]: 'Hóa học',
  [QuizCategory.SINH_HOC]: 'Sinh học',
  [QuizCategory.VAN_HOC]: 'Văn học',
  [QuizCategory.LICH_SU]: 'Lịch sử',
  [QuizCategory.DIA_LY]: 'Địa lý',
  [QuizCategory.TIENG_ANH]: 'Tiếng Anh',
  [QuizCategory.CONG_NGHE]: 'Công nghệ',
  [QuizCategory.KHAC]: 'Khác',
};

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  category: QuizCategory;
  userId: string;
  createdAt: string;
  updatedAt: string;
  questions?: Question[];
}

export interface Answer {
  id: string;
  content: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  content: string;
  timeLimit: number;
  imageUrl?: string;
  imageId?: string;
  pendingFile?: File;
  previewUrl?: string;
  answers: Answer[];
}




export interface CreateQuizDto {
  title: string;
  description?: string;
  category: QuizCategory;
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

export interface QuizPaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onPageChange?: (page: number) => void;
  showItemRange?: boolean;
  className?: string;
}