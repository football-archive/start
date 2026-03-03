// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// ✅ 本番ドメイン（ここを正にする）
const SITE_URL = "https://worldfootballarchive.com";

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
});
