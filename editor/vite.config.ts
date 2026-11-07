// エディタの組み立て。公開先の URL(canonical、共有の画像、サイトマップに要る)を index.html に差し込む
import { defineConfig } from "vite";
import type { Plugin } from "vite";

// SITE_URL を優先し、なければ Vercel が組み立て時に渡す本番の URL を使う。どちらもなければ空
function siteUrl() {
  const { SITE_URL, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
  const url = SITE_URL ?? (VERCEL_PROJECT_PRODUCTION_URL ? `https://${VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return url.replace(/\/+$/, "");
}

const PLACEHOLDER = "__SITE_URL__";

function site(): Plugin {
  const url = siteUrl();
  return {
    name: "law-zu-site",
    transformIndexHtml(html) {
      // URL が分からなければ、絶対 URL の要る行を消す(相対のままでは誤った情報になる)
      if (url) return html.replaceAll(PLACEHOLDER, url);
      return html
        .split("\n")
        .filter((line) => !line.includes(PLACEHOLDER))
        .join("\n");
    },
    generateBundle() {
      const sitemap = url ? `Sitemap: ${url}/sitemap.xml\n` : "";
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n${sitemap}` });
      if (!url) return;
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}/</loc></url>\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({ plugins: [site()] });
