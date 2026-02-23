// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// ✅ Netlify 本番（いったんこれで固定）
const SITE_URL =
  process.env.SITE_URL ?? "https://world-football-archive.netlify.app";

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
});
