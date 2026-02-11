import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rishi — Evidence-Based Foresight Engine",
  description: "Rishi watches developer signals, filters noise, and surfaces what's actionable. Evidence-backed trend intelligence from Hacker News, GitHub, Dev.to, and Reddit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--bg-0)] text-[var(--text-primary)]`}
      >
        <Nav />
        {children}
      </body>
    </html>
  );
}
