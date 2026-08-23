/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Every token resolves to a CSS variable declared in app/globals.css, so a
      // light theme is a variable swap rather than a second set of classes.
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        raised: "var(--raised)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",

        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-subtle": "var(--ink-subtle)",

        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-ink": "var(--accent-ink)",

        positive: "var(--positive)",
        negative: "var(--negative)",

        "danger-bg": "var(--danger-bg)",
        "danger-line": "var(--danger-line)",
        "danger-ink": "var(--danger-ink)",
        "warn-bg": "var(--warn-bg)",
        "warn-line": "var(--warn-line)",
        "warn-ink": "var(--warn-ink)",
      },
      fontFamily: {
        // These variables are set on <body> by next/font in app/layout.tsx. Before
        // this mapping existed the fonts were downloaded and never applied.
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-newsreader)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // A 1.25 ratio scale, replacing 21 ad-hoc pixel values.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
        xs: ["0.75rem", { lineHeight: "1.125rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.625rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "1.95rem", letterSpacing: "-0.01em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.015em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.02em" }],
        "5xl": ["3rem", { lineHeight: "3.15rem", letterSpacing: "-0.025em" }],
        "6xl": ["3.75rem", { lineHeight: "3.9rem", letterSpacing: "-0.03em" }],
      },
      borderRadius: {
        // Was 8 / 12 / 16px used interchangeably; now one ladder.
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      maxWidth: {
        // Page shells were capped at 1400px everywhere except /stocks at 1200px.
        page: "82rem",
      },
      boxShadow: {
        lift: "0 18px 40px -16px rgb(0 0 0 / 0.55)",
      },
    },
  },
  plugins: [],
};
