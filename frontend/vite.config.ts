import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Everything under /api goes to the gateway, so the browser never talks
    // to an agent directly and we avoid CORS headaches in development.
    proxy: {
      "/api": {
        target: process.env.VITE_GATEWAY_URL || "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
