'use client';

import { useState } from 'react';

export function TeachBackCard({ question }: { question: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!question) return;
    await navigator.clipboard.writeText(question);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg bg-blue-950/50 border border-blue-800/50 px-4 py-3">
      {question ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-blue-200 italic leading-relaxed">"{question}"</p>
          <button
            onClick={handleCopy}
            className="text-xs text-blue-400 hover:text-blue-200 flex-shrink-0 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-blue-400">Teach-back unavailable for this translation.</p>
      )}
    </div>
  );
}
