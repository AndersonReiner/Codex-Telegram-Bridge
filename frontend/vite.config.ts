import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: {
    outDir: "dist/settings",
    emptyOutDir: true,
    lib: {
      entry: "frontend/main.tsx",
      formats: ["es"],
      fileName: () => "configuracoes.js",
      cssFileName: "configuracoes",
    },
  },
});
