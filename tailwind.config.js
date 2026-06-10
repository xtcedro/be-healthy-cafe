/** @type {import('tailwindcss').Config} */
export default {
  content: ["./renderer/index.html", "./renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        // Oversized scale for a counter touchscreen used by non-technical staff.
        "pos-sm": ["1.125rem", { lineHeight: "1.5rem" }],
        "pos-base": ["1.375rem", { lineHeight: "1.875rem" }],
        "pos-lg": ["1.75rem", { lineHeight: "2.25rem" }],
        "pos-xl": ["2.5rem", { lineHeight: "3rem" }],
        "pos-2xl": ["3.5rem", { lineHeight: "4rem" }],
      },
      colors: {
        // Bee Healthy Cafe: leafy green primary with a warm honey accent.
        brand: {
          DEFAULT: "#16a34a",
          dark: "#15803d",
          light: "#22c55e",
        },
        honey: {
          DEFAULT: "#f59e0b",
          dark: "#b45309",
          light: "#fbbf24",
        },
      },
    },
  },
  plugins: [],
};
