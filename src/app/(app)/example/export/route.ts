import { requireUser } from "@/shared/auth";
import { exportRequestsCsv } from "@/features/example/export";

export async function GET(req: Request) {
  await requireUser();
  return exportRequestsCsv(new URL(req.url).searchParams);
}
