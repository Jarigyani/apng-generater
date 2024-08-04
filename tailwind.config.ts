import daisyui from "daisyui";
import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [
    daisyui,
    plugin(({ addUtilities }) => {
      addUtilities({
        ".disable-blur": {
          "image-rendering": "pixelated",
        },
      });
    }),
  ],
} satisfies Config;
