'use client';

import { useState, useCallback } from 'react';
import HardStop from './HardStop';

interface RetryFlowProps {
  children: React.ReactNode;
  onRetry: () => void;
  maxRetries?: number;
}

export default function RetryFlow({ children, onRetry, maxRetries = 3 }: RetryFlowProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [hardStopped, setHardStopped] = useState(false);

  const handleRetry = useCallback(() => {
    const next = retryCount + 1;
    if (next >= maxRetries) {
      setHardStopped(true);
    } else {
      setRetryCount(next);
      onRetry();
    }
  }, [retryCount, maxRetries, onRetry]);

  if (hardStopped) {
    return (
      <HardStop
        reason="Maximum retry attempts reached. Please try again later."
        onRetry={() => {
          setRetryCount(0);
          setHardStopped(false);
          onRetry();
        }}
      />
    );
  }

  return <>{children}</>;
}
