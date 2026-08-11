import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ConditionalPlaygroundNav } from "@/components/sentinel/ConditionalPlaygroundNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Escalation Engine",
  description: "AI-powered Slack alert triage and automated escalation",
};

export async function headers() {
  return {
    "ngrok-skip-browser-warning": "true",
  };
}

export default function RootLayout({ children }) {
  const navItems = [
    { href: "/playground", label: "Playground" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/benchmark", label: "Benchmark" },
    { href: "/benchmark/results", label: "Benchmark Results" },
    { href: "/comparison", label: "Comparison" },
  ];

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConditionalPlaygroundNav>
          <header className="border-b border-slate-200 bg-slate-900 text-white shadow-sm">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
              <Link
                href="/playground"
                className="text-sm font-semibold tracking-wide text-white hover:text-slate-200"
              >
                Escalation Engine
              </Link>
              <nav className="flex items-center gap-2 text-xs font-medium">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-1 text-slate-100 hover:bg-slate-800"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
        </ConditionalPlaygroundNav>
        {children}
      </body>
    </html>
  );
}
