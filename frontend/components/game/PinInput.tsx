'use client';

import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  error?: string;
  disabled?: boolean;
  length?: number;
  autoFocus?: boolean;
}

export function PinInput({
  value,
  onChange,
  onSubmit,
  error,
  disabled = false,
  length = 6,
  autoFocus = true,
}: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.replace(/\D/g, ''); // Only digits
    if (newValue.length > 1) {
      // Handle paste
      const chars = newValue.slice(0, length).split('');
      const newPin = chars.join('');
      onChange(newPin);
      const lastIndex = Math.min(chars.length - 1, length - 1);
      inputRefs.current[lastIndex]?.focus();
    } else {
      const newPin = value.split('');
      newPin[index] = newValue;
      onChange(newPin.join(''));

      // Move to next input
      if (newValue && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'Enter' && value.length === length && onSubmit) {
      onSubmit();
    }
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className="w-full">
      <div className="flex gap-2 justify-center">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onFocus={handleFocus}
            disabled={disabled}
            className={`
              w-12 h-14 text-center text-2xl font-bold
              border-2 rounded-lg
              transition-all duration-150
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${error
                ? 'border-red-500 bg-red-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
            `}
          />
        ))}
      </div>
      {error && (
        <p className="text-red-500 text-sm text-center mt-2">{error}</p>
      )}
    </div>
  );
}
