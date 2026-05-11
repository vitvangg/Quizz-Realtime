'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  className?: string;
}

export function PinInput({ 
  value, 
  onChange, 
  length = 6, 
  disabled = false,
  className = '' 
}: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const parts = value.split('');
    while (parts.length < length) parts.push('');
    parts.slice(0, length).forEach((char, i) => {
      if (inputRefs.current[i]) {
        inputRefs.current[i]!.value = char;
      }
    });
  }, [value, length]);

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    
    const newValue = value.split('');
    newValue[index] = char;
    const trimmed = newValue.join('').slice(0, length);
    onChange(trimmed);

    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      {Array.from({ length }).map((_, i) => (
        <Input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          className="w-12 h-14 text-center text-xl font-bold text-center"
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
        />
      ))}
    </div>
  );
}
