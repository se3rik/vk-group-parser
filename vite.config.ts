import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/vk-group-parser/",
  server: {
    proxy: {
      "/vkapi": {
        target: "https://api.vk.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vkapi/, ""),
      },
    },
  },
});
