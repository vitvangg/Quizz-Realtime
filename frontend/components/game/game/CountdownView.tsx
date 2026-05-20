'use client';

interface CountdownViewProps {
  countdown: number;
  message?: string;
  subMessage?: string;
}

export function CountdownView({ countdown, message = 'Game sắp bắt đầu', subMessage = 'Chuẩn bị câu hỏi' }: CountdownViewProps) {
  return (
    <div className="min-h-screen bg-neon-yellow flex items-center justify-center overflow-hidden">
      <div className="text-center">
        <p className="text-lg font-bold text-black/60 mb-8 uppercase tracking-wide">
          {message}
        </p>

        <div className="relative inline-block">
          <div className="bg-black border-4 border-black shadow-brutal-xl w-64 h-64 flex items-center justify-center">
            <span className="text-8xl font-black text-neon-yellow">
              {countdown}
            </span>
          </div>
        </div>

        <p className="text-2xl font-bold text-black/70 mt-8 uppercase tracking-wide">
          {subMessage}
        </p>
      </div>
    </div>
  );
}
