'use client';

import { useState } from 'react';

interface NicknameEntryProps {
  onSubmit: (nickname: string) => void;
  isLoading?: boolean;
}

export function NicknameEntry({ onSubmit, isLoading = false }: NicknameEntryProps) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedNickname = nickname.trim();

    if (trimmedNickname.length < 2) {
      setError('Nickname must be at least 2 characters');
      return;
    }

    if (trimmedNickname.length > 20) {
      setError('Nickname must be at most 20 characters');
      return;
    }

    setError('');
    onSubmit(trimmedNickname);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Enter Your Nickname</h2>
          <p className="text-gray-500 mt-2">This will be displayed to other players</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setError('');
              }}
              placeholder="Your nickname (2-20 chars)"
              maxLength={20}
              autoFocus
              disabled={isLoading}
              className={`
                w-full px-4 py-3 text-lg
                border-2 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500
                transition-all
                ${error
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:border-blue-500'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            />
            {error && (
              <p className="text-red-500 text-sm mt-2">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || nickname.trim().length < 2}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Joining...' : 'Join Room'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400">
            You can play without an account!
          </p>
        </div>
      </div>
    </div>
  );
}
