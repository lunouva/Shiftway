/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          lightest: "#EBF7FC",
          light:    "#C5E8F4",
          DEFAULT:  "#82C8E5",
          dark:     "#3A8FAD",
          darker:   "#1E6080",
          text:     "#0F3D52",
        },
        accent: "#F59E0B",
      },
    },
  },
  safelist: [
    "bg-brand", "bg-brand-dark", "bg-brand-darker", "bg-brand-light", "bg-brand-lightest",
    "text-brand-dark", "text-brand-darker", "text-brand-text",
    "border-brand", "border-brand-dark", "border-brand-light",
  ],
  plugins: [],
}
// This file intentionally left with a trailing newline
