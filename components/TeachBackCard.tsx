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
    <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm border border-slate-100">
      <div className="bg-primary-fixed px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-on-primary-fixed"
            style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
          >
            quiz
          </span>
          <p className="text-[10px] font-bold text-on-primary-fixed uppercase tracking-widest font-label">
            Teach-Back Verification
          </p>
        </div>
        {question && (
          <button
            onClick={handleCopy}
            className="text-[10px] font-bold text-on-primary-fixed/70 hover:text-on-primary-fixed uppercase tracking-widest transition-colors font-label"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
      <div className="p-5">
        {question ? (
          <p className="text-sm text-on-surface leading-relaxed italic">"{question}"</p>
        ) : (
          <p className="text-sm text-on-surface-variant">
            Teach-back question unavailable for this translation.
          </p>
        )}
      </div>
    </div>
  );
}
