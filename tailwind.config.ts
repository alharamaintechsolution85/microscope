import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#718096",
        canvas: "#F5F7FB",
        line: "#E5E9F2",
        accent: "#6366F1",
        cyan: "#06B6D4",
        rose: "#F43F5E",
        violet: "#A855F7",
        amber: "#F59E0B"
      },
      boxShadow: {
        card: "0 10px 35px rgba(27, 39, 71, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
