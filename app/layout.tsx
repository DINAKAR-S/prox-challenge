import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vulcan OmniPro 220 — Welding Support Agent",
  description: "Multimodal support agent for the Vulcan OmniPro 220 welder",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
