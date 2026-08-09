import type { Config } from "tailwindcss";

// Tailwind's documented CSS-variable color pattern: lets every existing
// utility (bg-panel, text-muted/70, ring-accent/15, ...) resolve against
// :root / .dark variables in globals.css with zero className changes.
function withOpacity(variable: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue !== undefined ? `rgb(var(${variable}) / ${opacityValue})` : `rgb(var(${variable}))`;
}

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: withOpacity("--color-bg"),
        panel: withOpacity("--color-panel"),
        border: withOpacity("--color-border"),
        text: withOpacity("--color-text"),
        muted: withOpacity("--color-muted"),
        accent: withOpacity("--color-accent"),
      } as unknown as Record<string, string>,
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
