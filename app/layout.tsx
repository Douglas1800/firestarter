import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agenda Nord Vaudois - Veille IA pour journalistes",
  description: "Générez des agendas culturels et politiques du Nord Vaudois grâce à l'IA. Crawlez vos sources, interrogez l'agenda en langage naturel.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "http://localhost:3000"),
  openGraph: {
    title: "Agenda Nord Vaudois - Veille IA pour journalistes",
    description: "Générez des agendas culturels et politiques du Nord Vaudois grâce à l'IA.",
    url: "/",
    siteName: "Agenda Nord Vaudois",
    locale: "fr_CH",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        suppressHydrationWarning={true}
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <main className="">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
