import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://127.0.0.1:3000'),
  title: 'FinanceReview｜本機資產紀錄',
  description: '在本機保存帳戶、持倉與資產快照，清楚查看每一段資產變化。',
  openGraph: {
    title: 'FinanceReview｜本機資產紀錄',
    description: '用快照保存每一次資產狀態，帳戶、持倉與歷史走勢一目了然。',
    images: ['/og.png'],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
