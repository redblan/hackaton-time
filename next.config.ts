import type { NextConfig } from "next";

// cacheComponents намеренно выключен: на хакатоне нужна простая модель
// "каждый запрос читает свежие данные из БД". См. AGENTS.md.
const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-right" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
