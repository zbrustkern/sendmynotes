import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        vending: {
          cream: "#FAF8F5",
          paper: "#FDFCF7",
          card: "#FFFFFF",
          ink: "#1C2434",
          penBlue: "#1B3B6F",
          penBlack: "#111827",
          accent: "#D97706",
          brass: "#B45309",
          mint: "#059669",
          stampRed: "#DC2626",
          border: "#E5E0D8",
          dark: "#0F172A",
        },
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "'Playfair Display'", "Georgia", "'Times New Roman'", "serif"],
        display: ["'Playfair Display'", "Georgia", "serif"],
        hwAdam: ["var(--font-hw-adam)", "'HandwryttenAdam'", "Caveat", "'Bradley Hand'", "cursive"],
        hwCharity: ["var(--font-hw-charity)", "'HandwryttenCharity'", "'Patrick Hand'", "cursive"],
        hwChase: ["var(--font-hw-chase)", "'HandwryttenChase'", "'Dancing Script'", "'Snell Roundhand'", "cursive"],
        hwDavid: ["var(--font-hw-david)", "'HandwryttenDavid'", "'Architects Daughter'", "cursive"],
        handwriting: ["var(--font-hw-adam)", "Caveat", "'Bradley Hand'", "cursive"],
        script: ["var(--font-hw-chase)", "'Dancing Script'", "'Snell Roundhand'", "cursive"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
        cardHover: "0 20px 35px -5px rgba(0, 0, 0, 0.12), 0 10px 15px -5px rgba(0, 0, 0, 0.06)",
        vending: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
