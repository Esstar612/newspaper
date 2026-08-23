import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

// Serif headlines over sans furniture is what makes a page read as editorial
// rather than as a dashboard. Geist stays for UI, metadata, and numerals.
const newsreader = Newsreader({
    variable: "--font-newsreader",
    subsets: ["latin"],
    display: "swap",
});

export const metadata: Metadata = {
    title: "The Newspaper",
    description: "Markets, news, and weather — all in one place",
    icons: {
        icon: [
            { url: '/favicon.ico' },
            { url: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
            { url: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
    },
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: ReactNode;
}>) {
    return (
        // The font variables live on <html> so Tailwind Preflight's own
        // `html { font-family: ... }` rule can resolve them too.
        // suppressHydrationWarning: the inline script below adds a class to <html>
        // before React hydrates, which would otherwise be reported as a mismatch.
        <html
            lang="en"
            suppressHydrationWarning
            className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}
        >
        <head>
            <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body className="antialiased">
        <Header />
        {children}
        </body>
        </html>
    );
}