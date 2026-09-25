import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.PAGES_BASE || "/",
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});
