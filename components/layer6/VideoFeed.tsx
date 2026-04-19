'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface VideoFeedProps {
  stream: MediaStream | null;
  videoRef?: RefObject<HTMLVideoElement>;
}

export default function VideoFeed({ stream, videoRef }: VideoFeedProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const targetRef = videoRef ?? localRef;

  useEffect(() => {
    const video = targetRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream, targetRef]);

  return (
    <video
      ref={targetRef}
      autoPlay
      playsInline
      muted
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}
