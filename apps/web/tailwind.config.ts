import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: {
            DEFAULT: "#023075",
            950: "#022050",
            900: "#023075",
            800: "#0c2e7a",
          },
          blue: {
            DEFAULT: "#0B409C",
            50: "#F0F5FF",
            100: "#E0EBFF",
            500: "#2563EB",
            600: "#1D63D8",
            700: "#0B409C",
            800: "#0A3580",
            900: "#072663",
          },
          cyan: {
            DEFAULT: "#0077B6",
            50: "#E6F4FA",
            100: "#E0F2FE",
            500: "#0EA5E9",
            600: "#0077B6",
            light: "#E6F4FA",
          },
          red: {
            DEFAULT: "#DF1C2D",
            50: "#FFF1F2",
            100: "#FEE2E2",
            500: "#EF4444",
            600: "#DF1C2D",
            700: "#BD1E2C",
          },
        },
        surface: {
          base: "#F4F7FC",
          card: "#FFFFFF",
          muted: "#F8FAFC",
          border: "#E2E8F0",
        },
        pharma: {
          otc: "#10B981",
          limited: "#0284C7",
          ethical: "#DF1C2D",
          warning: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        script: ["Caveat", "Dancing Script", "cursive"],
      },
      boxShadow: {
        card: "0 2px 10px rgba(11, 64, 156, 0.05)",
        elevated: "0 8px 24px rgba(11, 64, 156, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
