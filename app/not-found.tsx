import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="text-4xl font-black tracking-tight mb-2">404</h1>
      <h2 className="text-lg font-bold mb-1">Page Not Found</h2>
      <p className="text-sm text-muted-foreground text-center max-h-12 max-w-md mb-6">
        The requested heat-risk dashboard page or telemetry ward route does not exist.
      </p>
      <Button asChild className="rounded-xl">
        <Link href="/maps">
          <ArrowLeft className="mr-2 h-4 w-4" /> Return to Map Console
        </Link>
      </Button>
    </div>
  );
}
