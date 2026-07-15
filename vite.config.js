import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: "autoUpdate",
    injectRegister: "inline",
    includeAssets: ["favicon.svg", "robots.txt"],
    manifest: {
      name: "Quiz Master",
      short_name: "QuizMaster",
      description: "刷题工具",
      theme_color: "#111827",
      background_color: "#111827",
      display: "standalone",
      //orientation: 'portrait', // 锁定竖屏体验
      start_url: "/",
      icons: [
        {
          src: "pwa-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
    },
  }), cloudflare()],
});