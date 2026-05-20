'use client';

import { CheckCircle } from 'lucide-react';

interface Answer {
  id: string;
  content: string;
}

interface AnswerButtonsProps {
  answers: Answer[];
  selectedAnswerId?: string | null;
  correctAnswerId?: string | null;
  showCorrect?: boolean;
  disabled?: boolean;
  isHost?: boolean;
  onAnswerSelect?: (answerId: string) => void;
}

// Neo-Brutalism colors for answers
const answerColors = [
  { bg: 'bg-neon-blue', border: 'border-blue-600', hover: 'hover:bg-blue-600' },
  { bg: 'bg-neon-green', border: 'border-green-600', hover: 'hover:bg-green-600' },
  { bg: 'bg-neon-yellow', border: 'border-yellow-500', hover: 'hover:bg-yellow-500' },
  { bg: 'bg-neon-purple', border: 'border-purple-600', hover: 'hover:bg-purple-600' },
];

export function AnswerButtons({
  answers,
  selectedAnswerId,
  correctAnswerId,
  showCorrect = false,
  disabled = false,
  isHost = false,
  onAnswerSelect,
}: AnswerButtonsProps) {
  if (showCorrect) {
    // Show results mode
    return (
      <div className="space-y-3">
        {answers.map((answer, index) => {
          const isAnswerCorrect = answer.id === correctAnswerId;
          const isSelected = answer.id === selectedAnswerId;

          return (
            <div
              key={answer.id}
              className={`
                p-4 rounded-xl flex items-center gap-3 border-4 border-black
                ${isAnswerCorrect
                  ? 'bg-neon-green shadow-brutal'
                  : isSelected
                    ? 'bg-red-500 shadow-brutal'
                    : 'bg-white shadow-brutal-sm'
                }
              `}
            >
              <span className={`w-10 h-10 rounded-lg border-2 border-black flex items-center justify-center font-black text-lg ${
                isAnswerCorrect || isSelected ? 'bg-black text-white' : 'bg-black/10 text-black'
              }`}>
                {String.fromCharCode(65 + index)}
              </span>
              <span className={`flex-1 font-bold text-lg ${isAnswerCorrect || isSelected ? 'text-white' : 'text-black'}`}>
                {answer.content}
              </span>
              {isAnswerCorrect && <CheckCircle className="w-6 h-6 text-white" />}
            </div>
          );
        })}
      </div>
    );
  }

  // Interactive mode
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {answers.map((answer, index) => {
        const color = answerColors[index % 4];
        const isSelected = selectedAnswerId === answer.id;

        return (
          <button
            key={answer.id}
            onClick={() => !isHost && !disabled && onAnswerSelect?.(answer.id)}
            disabled={disabled || isHost}
            className={`
              ${color.bg} border-4 border-black
              text-white text-xl py-10 px-6
              font-black uppercase
              shadow-brutal
              transition-all duration-150
              ${!isHost && !disabled ? `${color.hover} hover:-translate-y-1 hover:shadow-brutal-lg cursor-pointer` : ''}
              ${isSelected ? 'ring-4 ring-white scale-105' : ''}
              disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0
            `}
          >
            <span className="flex items-center justify-center gap-4">
              <span className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center text-2xl font-black">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="text-left flex-1">{answer.content}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
