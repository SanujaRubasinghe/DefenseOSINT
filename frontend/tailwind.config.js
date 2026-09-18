/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Workstation surfaces — near-black through raised panel.
        void: "#07090b",
        base: "#0b0e11",
        panel: "#11151a",
        raised: "#171c22",
        line: "#232a33",
        "line-bright": "#323b47",

        ink: "#e6ebf0",
        muted: "#8593a1",
        dim: "#5b6774",

        // Semantic accents. Cyan carries the product; the rest are states.
        accent: "#38bdf8",
        "accent-dim": "#1a6a8f",
        verified: "#4ade80",
        review: "#fbbf24",
        critical: "#f87171",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(56,189,248,0.25), 0 0 24px -6px rgba(56,189,248,0.35)",
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset",
      },
      transitionDuration: {
        DEFAULT: "180ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulse_soft: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        sweep: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 200ms ease both",
        "pulse-soft": "pulse_soft 1.8s ease-in-out infinite",
        sweep: "sweep 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
