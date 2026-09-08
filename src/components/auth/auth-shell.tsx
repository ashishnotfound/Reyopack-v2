import { AppLogo } from "@/components/app-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="scanner-grid flex min-h-screen items-center justify-center bg-background p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><AppLogo href="/login" /></div>
        <Card className="shadow-2xl shadow-black/10">
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
