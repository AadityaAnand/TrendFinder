import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "./components/Nav";
import { FeedbackWidget } from "./components/FeedbackWidget";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rishi — Early opportunity radar for builders",
  description: "Rishi scans 7 developer communities daily, surfaces what builders actually need, and delivers evidence-backed briefs — before the idea goes mainstream.",
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
        <FeedbackWidget />
      </body>
    </html>
  );
}
