import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vulcan OmniPro 220 — Welding Support Agent",
  description: "Multimodal support agent for the Vulcan OmniPro 220 welder",
};

// ponytail: sync inline script, runs before first paint, no FOUC.
// Reads persisted choice; falls back to OS preference.
const THEME_INIT = `(function(){try{var s=localStorage.getItem("theme");var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="bg-bg font-sans text-text antialiased transition-colors duration-200">{children}</body>
    </html>
  );
}
