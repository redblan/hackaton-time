import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Схемы собираются по маске: новая фича с файлом schema.ts подхватится сама.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/shared/db/*.schema.ts", "./src/features/*/schema.ts"],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
