import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthBootstrap } from "../components/auth-bootstrap";
import SystemEventNotification from "@/components/admin/SystemEventNotification";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quiz Game - Host Dashboard",
  description: "Create and host interactive quiz games",
  icons: {
    icon: "/logo2.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <AuthBootstrap />
        {children}
        <Toaster richColors position="top-right" />
        <SystemEventNotification />
      </body>
    </html>
  );
}
