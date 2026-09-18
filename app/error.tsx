"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error caught:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold mb-1">Something went wrong</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        {error.message || "An unexpected error occurred in the application."}
      </p>
      <Button onClick={() => reset()} className="rounded-xl">
        <RotateCcw className="mr-2 h-4 w-4" /> Try Again
      </Button>
    </div>
  );
}
