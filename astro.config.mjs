// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// ★ここは後で本番URLに差し替えでOK（例: https://soccer-db.example.com）
const SITE_URL = process.env.SITE_URL ?? "https://example.com";

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
});
