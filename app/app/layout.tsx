import type { Metadata } from "next";
import "./globals.css";
import "./dashboard.css";

const themeInitScript = `(function(){try{var t=localStorage.getItem('finance-review-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`;

export const metadata: Metadata = {
  metadataBase: new URL("https://finance.hsun.dev"),
  title: "FinanceReview｜個人資產紀錄",
  description: "保存帳戶、持倉與資產快照，清楚查看每一段資產變化。",
  openGraph: {
    title: "FinanceReview｜個人資產紀錄",
    description: "用快照保存每一次資產狀態，帳戶、持倉與歷史走勢一目了然。",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
