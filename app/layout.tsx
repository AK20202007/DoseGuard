import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DoseGuard — Medical Translation Safety',
  description:
    'AI-powered medication instruction translation safety verification tool. Detects semantic drift in translated medical instructions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
