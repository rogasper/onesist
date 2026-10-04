import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 4322 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
