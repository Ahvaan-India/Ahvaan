"use client";

import type { LucideIcon } from "lucide-react";

export function PageHeader({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Icon className={`h-6 w-6 ${iconClassName ?? "text-primary"}`} />
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
