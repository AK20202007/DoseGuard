'use client';

interface LightingBannerProps {
  message: string | null;
}

export default function LightingBanner({ message }: LightingBannerProps) {
  if (message === null) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(255, 200, 0, 0.9)',
        color: '#1a1a1a',
        textAlign: 'center',
        padding: '10px 16px',
        fontWeight: 600,
        fontSize: '14px',
        zIndex: 10,
      }}
    >
      {message}
    </div>
  );
}
