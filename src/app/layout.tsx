import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "gAmErS cOuRtSiDe | Badminton with your people",
  description: "The gAmErS badminton scorebook.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black", title: "gAmErS cOuRtSiDe" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
