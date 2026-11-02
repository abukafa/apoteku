import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: {
            DEFAULT: "#0B409C",
            50: "#F0F5FF",
            100: "#E0EBFF",
            500: "#1D63D8",
            700: "#0B409C",
            900: "#072663",
          },
          cyan: {
            DEFAULT: "#0077B6",
            light: "#E6F4FA",
          },
          red: {
            DEFAULT: "#E63946",
            50: "#FFF1F2",
            500: "#E63946",
            700: "#BD1E2C",
          },
        },
        surface: {
          base: "#F4F7FC",
          card: "#FFFFFF",
          border: "#E2E8F0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 2px 10px rgba(11, 64, 156, 0.05)",
        elevated: "0 8px 24px rgba(11, 64, 156, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
