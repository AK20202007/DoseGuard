'use client';

import { useState } from 'react';

type Props = {
  question: string | null;
};

export function TeachBackCard({ question }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!question) return;
    await navigator.clipboard.writeText(question);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-4 h-4 text-blue-600 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
          Teach-Back Verification
        </span>
      </div>
      {question ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-blue-900 italic">"{question}"</p>
          <button
            onClick={handleCopy}
            className="text-xs text-blue-600 hover:text-blue-800 flex-shrink-0 underline"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-blue-600">
          Teach-back question unavailable for this translation.
        </p>
      )}
    </div>
  );
}
