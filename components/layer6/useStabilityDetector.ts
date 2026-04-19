'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export function useStabilityDetector(
  videoRef: RefObject<HTMLVideoElement>,
  onStable: () => void,
  threshold: number = 10,
): { isStable: boolean } {
  const [isStable, setIsStable] = useState(false);
  const onStableRef = useRef(onStable);
  const stableStartRef = useRef<number | null>(null);
  const prevDataRef = useRef<Uint8ClampedArray | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    onStableRef.current = onStable;
  }, [onStable]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const SAMPLE_WIDTH = 64;
    const SAMPLE_HEIGHT = 48;
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;

    const check = () => {
      const video = videoRef.current;
      if (!video || !ctx || video.readyState < 2) return;

      ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const { data } = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);

      if (prevDataRef.current) {
        let delta = 0;
        for (let i = 0; i < data.length; i += 4) {
          delta +=
            Math.abs(data[i] - prevDataRef.current[i]) +
            Math.abs(data[i + 1] - prevDataRef.current[i + 1]) +
            Math.abs(data[i + 2] - prevDataRef.current[i + 2]);
        }
        const avgDelta = delta / (SAMPLE_WIDTH * SAMPLE_HEIGHT * 3);

        if (avgDelta > threshold) {
          stableStartRef.current = null;
          setIsStable(false);
          calledRef.current = false;
        } else {
          if (stableStartRef.current === null) {
            stableStartRef.current = Date.now();
          } else if (Date.now() - stableStartRef.current >= 500 && !calledRef.current) {
            calledRef.current = true;
            setIsStable(true);
            onStableRef.current();
          }
        }
      }

      prevDataRef.current = new Uint8ClampedArray(data);
    };

    intervalRef.current = setInterval(check, 100);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [videoRef, threshold]);

  return { isStable };
}
