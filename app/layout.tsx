import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ThemeSync } from "@/components/shell/theme-sync";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Studio Tracker",
  description: "Project tracker for a web development studio",
};

/**
 * Applies the saved theme before the first paint. Without this every page
 * renders light and then snaps to dark, which is worse than either.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("studio-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
