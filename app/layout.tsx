import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MainNav } from "@/components/nav/MainNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gestor Financeiro",
  description: "Gestor Financeiro - controle de contas, transações e categorias",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50">
        <MainNav />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
