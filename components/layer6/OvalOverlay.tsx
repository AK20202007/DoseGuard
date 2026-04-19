'use client';

import { useEffect, useRef } from 'react';

interface OvalOverlayProps {
  width: number;
  height: number;
}

export interface OvalMask {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export function getOvalMask(width: number, height: number): OvalMask {
  return {
    cx: width / 2,
    cy: height / 2,
    rx: width * 0.35,
    ry: height * 0.45,
  };
}

export default function OvalOverlay({ width, height }: OvalOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const { cx, cy, rx, ry } = getOvalMask(width, height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
