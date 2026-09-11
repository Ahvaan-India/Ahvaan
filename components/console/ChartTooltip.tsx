"use client";

/**
 * Shared hover popup for every analytics chart (single source for tooltip UI).
 * Theme-aware popover card: bold heading (what you hovered), then one row
 * per parameter with a color dot, plain-language name and tabular value +
 * unit. Recharts injects active/payload/label into `content`.
 */

export interface TipField {
  /** Key in the hovered datum (e.g. "risk", "pop"). */
  key: string;
  /** Plain-language parameter name shown in the row. */
  label: string;
  unit?: string;
  color?: string;
  format?: (v: any) => string;
}

interface Entry {
  name?: string | number;
  value?: any;
  color?: string;
  fill?: string;
  dataKey?: string | number;
  payload?: Record<string, any>;
}

function entryColor(e: Entry): string {
  return (
    e.color ??
    e.fill ??
    e.payload?.fill ??
    e.payload?.color ??
    "hsl(var(--primary))"
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  unit = "",
  fields,
  title,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: any;
  /** Unit appended to generic rows (e.g. "/100", " wards", " °C"). */
  unit?: string;
  /** Explicit rows read from the hovered datum (best for scatters/pies). */
  fields?: TipField[];
  /**
   * Heading override: string, (label, datum) => string, or null to hide.
   * Default falls back through label → datum label/date/subject/name.
   */
  title?: string | ((label: any, datum: Record<string, any>) => string) | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum: Record<string, any> = payload[0]?.payload ?? {};
  const heading =
    title === null
      ? ""
      : typeof title === "function"
        ? title(label, datum)
        : (title ??
          (label !== undefined && label !== "" && label !== null
            ? String(label)
            : (datum.label ??
              datum.date ??
              datum.d ??
              datum.bucket ??
              datum.subject ??
              datum.name ??
              "")));

  const rows = (
    fields
      ? fields.map((f) => ({
          label: f.label,
          color: f.color ?? entryColor(payload[0]),
          raw: datum[f.key],
          unit: f.unit ?? "",
          format: f.format,
        }))
      : payload
          .filter((p) => p.value !== undefined && !Array.isArray(p.value))
          .map((p) => ({
            label: String(p.name ?? p.dataKey ?? ""),
            color: entryColor(p),
            raw: p.value,
            unit,
            format: undefined as ((v: any) => string) | undefined,
          }))
  ).filter((r) => r.raw !== undefined && r.raw !== null && r.label !== "");

  if (heading === "" && rows.length === 0) return null;
  return (
    <div className="min-w-[168px] rounded-xl border bg-popover px-3 py-2 shadow-xl">
      {heading !== "" && (
        <p className="mb-1 text-xs font-extrabold">{heading}</p>
      )}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: r.color }}
            />
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto pl-3 font-bold tabular-nums">
              {r.format ? r.format(r.raw) : String(r.raw)}
              {r.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
