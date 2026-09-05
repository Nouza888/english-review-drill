import { defineConfig } from "vite";

export default defineConfig({
  base: "/english-review-drill/",
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: "es2020",
  },
});
