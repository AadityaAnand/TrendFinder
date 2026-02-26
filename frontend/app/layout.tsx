import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "./components/Nav";

const inter = Inter({
  variable: "--font-sans",
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
    <html lang="en">
      <body
        className={`${inter.variable} antialiased bg-white text-slate-900`}
      >
        <Nav />
        {children}
      </body>
    </html>
  );
}
