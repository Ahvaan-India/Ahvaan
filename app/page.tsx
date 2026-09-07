"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/console/TopBar";
import { KpiRow } from "@/components/console/KpiRow";
import { HeatmapPanel, type HeatCell } from "@/components/console/HeatmapPanel";
import { WardPopover } from "@/components/console/WardPopover";
import { Gauge } from "@/components/console/Gauge";
import { DriversPanel } from "@/components/console/DriversPanel";
import { TrajectoryStrip } from "@/components/console/TrajectoryStrip";
import { AlertsList, type ActiveAlert } from "@/components/console/AlertsList";
import { TelemetryPanel, type Telemetry } from "@/components/console/TelemetryPanel";
import { SendAlertModal, type AlertOption } from "@/components/console/SendAlertModal";
import { KOLKATA_TIMEZONE } from "@/lib/geo/timezone";

const jsonFetch = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

interface Summary {
  wards: number;
  synced: number;
  total: number;
  active: number;
  extreme: number;
  high: number;
  moderate: number;
  deltas: Record<string, number | null>;
  deltaBasis: string | null;
  metroHeatLoad: number;
  watch: { level: number; name: string };
  refreshedAt: string;
}

/**
 * HeatWatch Kolkata — municipal heat-risk command center.
 * Ward selection (heatmap hover/click, alert cards) drives the telemetry
 * panel and the WhatsApp modal's default context.
 */
export default function Home() {
  const { data: summary } = useSWR<Summary>("/api/wards/summary", jsonFetch);
  const { data: heatmap } = useSWR<{ count: number; refreshedAt: string; wards: HeatCell[] }>(
    "/api/wards/heatmap",
    jsonFetch,
  );
  const { data: alertsData } = useSWR<{ count: number; alerts: ActiveAlert[] }>(
    "/api/alerts/active",
    jsonFetch,
  );

  const [selectedId, setSelectedId] = useState<number>(1);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAlertId, setModalAlertId] = useState<number | null>(null);
  const displayId = hoveredId ?? selectedId;

  const { data: telemetry } = useSWR<Telemetry>(
    `/api/wards/${displayId}/telemetry`,
    jsonFetch,
  );
  const { data: forecast } = useSWR<{
    timezone: string;
    days: Array<{
      date: string;
      tempMin: number;
      tempMax: number;
      heatIndexMax: number;
      risk: number;
      category: string;
      mortality?: { index: number; band: string };
    }>;
  }>(`/api/forecast/${displayId}?days=5`, jsonFetch);

  const alerts = useMemo(() => alertsData?.alerts ?? [], [alertsData]);
  useEffect(() => {
    if (alerts.length > 0) setSelectedId((prev) => (prev === 1 ? alerts[0].wardId : prev));
  }, [alerts]);

  const timezone = telemetry?.timezone ?? forecast?.timezone ?? KOLKATA_TIMEZONE;
  const watchLabel = summary ? `Level ${summary.watch.level} · ${summary.watch.name}` : "Level …";
  const refreshedAt = summary?.refreshedAt ?? heatmap?.refreshedAt ?? null;

  const alertOptions: AlertOption[] = useMemo(
    () =>
      alerts.map((a) => ({
        id: a.id,
        wardId: a.wardId,
        ward: a.ward,
        wardName: a.wardName,
        severity: a.severity,
        riskScore: a.riskScore,
        peakWindowStart: a.peakWindowStart,
        peakWindowEnd: a.peakWindowEnd,
        advisoryText: a.advisoryText,
        wbgt: telemetry && telemetry.wardId === a.wardId ? telemetry.risk?.wbgt ?? null : null,
      })),
    [alerts, telemetry],
  );

  const openModalFor = (alertId: number | null) => {
    setModalAlertId(alertId);
    setModalOpen(true);
  };

  return (
    <>
      <TopBar
        watchLabel={watchLabel}
        syncedAt={refreshedAt}
        syncDetail={summary ? `${summary.synced}/${summary.total} wards` : null}
        timezone={timezone}
        onSendAlert={() => openModalFor(alerts[0]?.id ?? null)}
      />

      <main id="overview" className="mx-auto max-w-[1280px] space-y-4 px-4 pb-10 pt-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Human Impact &amp; Heat Risk Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              {summary ? (
                <>
                  {summary.wards} wards monitored · {summary.active} active · metro load{" "}
                  {summary.metroHeatLoad}/100 · refreshed{" "}
                  {summary.refreshedAt
                    ? new Date(summary.refreshedAt).toLocaleString("en-IN", { timeZone: timezone })
                    : "—"}
                </>
              ) : (
                "Loading metropolitan rollup…"
              )}
            </p>
          </div>

          <KpiRow data={summary ?? null} />

          <div className="grid items-start gap-4 xl:grid-cols-[8fr_5fr]">
            <HeatmapPanel
              cells={heatmap?.wards ?? []}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={setSelectedId}
              onHover={setHoveredId}
              popover={<WardPopover telemetry={telemetry ?? null} />}
            />
            <div className="space-y-4">
              <Gauge load={summary?.metroHeatLoad ?? null} watchLabel={watchLabel} />
              <DriversPanel
                data={
                  telemetry
                    ? {
                        humidity: telemetry.macro.humidity,
                        wind: telemetry.macro.wind,
                        solar: telemetry.macro.solar,
                        elderlyPct: telemetry.demographics.elderlyPct,
                        childrenPct: telemetry.demographics.childrenPct,
                        thermal: telemetry.risk?.thermal ?? null,
                        persistence: telemetry.risk?.persistence ?? null,
                        recovery: telemetry.risk?.recovery ?? null,
                        outdoorWorkerPct: telemetry.demographics.outdoorWorkerPct,
                        humidityDelta: telemetry.macro.deltas.humidity,
                        windDelta: telemetry.macro.deltas.wind,
                        solarDelta: telemetry.macro.deltas.solar,
                      }
                    : null
                }
              />
            </div>
          </div>

          <section id="trajectory">
            <h2 className="mb-3 text-lg font-semibold">
              5-Day Predictive Heat Trajectory &amp; Mortality Risk Window
            </h2>
            <TrajectoryStrip days={forecast?.days ?? []} timeZone={timezone} />
            <p className="mt-1 text-xs text-muted-foreground">
              Trajectory shows engine risk per ward-local day. The engine is not a
              mortality model — treat “risk window” as heat-load planning guidance.
            </p>
          </section>

          <section id="alerts">
            <h2 className="mb-3 text-lg font-semibold">
              Active Ward Alerts{" "}
              {alertsData && (
                <span className="text-sm font-normal tabular-nums text-muted-foreground">
                  {alertsData.count} live
                </span>
              )}
            </h2>
            <AlertsList
              alerts={alertsData ? alertsData.alerts : null}
              timezone={timezone}
              onSelectWard={(id) => {
                setSelectedId(id);
                setHoveredId(null);
              }}
            />
          </section>

          <section id="telemetry">
            <TelemetryPanel
              data={telemetry ?? null}
              forecastDays={(forecast?.days ?? []).map((d) => ({
                date: d.date,
                risk: d.risk,
                category: d.category,
                tempMin: d.tempMin,
                tempMax: d.tempMax,
              }))}
            />
          </section>
        </main>

      <SendAlertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        alerts={alertOptions}
        defaultAlertId={modalAlertId}
        timezone={timezone}
        telemetry={telemetry ?? null}
        outlook={(forecast?.days ?? []).map((d) => ({
          date: d.date,
          tempMax: d.tempMax,
          risk: d.risk,
          category: d.category,
        }))}
      />
    </>
  );
}
