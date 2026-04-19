'use client';

interface HardStopProps {
  reason: string;
  onRetry: () => void;
}

export default function HardStop({ reason, onRetry }: HardStopProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#cc0000',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '16px' }}>Unable to Continue</h1>
      <p style={{ fontSize: '16px', maxWidth: '480px', marginBottom: '32px', lineHeight: 1.5 }}>
        {reason}
      </p>
      <button
        onClick={onRetry}
        style={{
          backgroundColor: '#ffffff',
          color: '#cc0000',
          border: 'none',
          borderRadius: '6px',
          padding: '12px 28px',
          fontSize: '16px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </div>
  );
}
