'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PinInput } from '@/components/game/PinInput';
import { toast } from 'sonner';

export default function LandingPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handlePinSubmit = async () => {
    if (pin.length !== 6) {
      setError('Please enter a 6-digit PIN');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Verify PIN exists
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}room/pin/${pin}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Room not found. Please check the PIN.');
        } else {
          setError('Failed to join room. Please try again.');
        }
        return;
      }

      const room = await response.json();

      // Navigate to waiting room
      router.push(`/room/${pin}`);
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginClick = () => {
    router.push('/signin');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Quiz Game</h1>
          <p className="text-gray-600 mt-2">Challenge your friends in real-time!</p>
        </div>

        {/* PIN Entry Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">
            Enter Room Code
          </h2>

          <div className="mb-6">
            <PinInput
              value={pin}
              onChange={setPin}
              onSubmit={handlePinSubmit}
              error={error}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handlePinSubmit}
            disabled={pin.length !== 6 || isLoading}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Joining...
              </span>
            ) : (
              'Join Room'
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-gray-200" />
            <span className="px-4 text-gray-400 text-sm">OR</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* Login Button */}
          <button
            onClick={handleLoginClick}
            className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Login to Host a Game
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Want to create your own quiz?{' '}
            <a href="/signup" className="text-blue-600 hover:underline">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
