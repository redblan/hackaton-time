import { asc } from "drizzle-orm";
import { db } from "@/shared/db";
import { users } from "@/shared/db/users.schema";
import { loginAs } from "@/shared/auth/actions";
import { APP } from "@/shared/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const list = await db.select().from(users).orderBy(asc(users.id)).limit(6);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{APP.name}</CardTitle>
          <CardDescription>{APP.tagline}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="pb-1 text-sm text-muted-foreground">Войти как:</p>
          {list.length === 0 && <p className="text-sm text-destructive">Пользователей нет. Запустите: npm run demo</p>}
          {list.map((u) => (
            <form key={u.id} action={loginAs}>
              <input type="hidden" name="userId" value={u.id} />
              <Button variant="outline" className="h-auto w-full justify-between py-3">
                <span className="text-left">
                  <span className="block font-medium">{u.name}</span>
                  <span className="block text-xs text-muted-foreground">{u.email}</span>
                </span>
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                  {u.role === "admin" ? "Админ" : "Пользователь"}
                </Badge>
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
