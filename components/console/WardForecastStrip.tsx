"use client";

import { HeartPulse } from "lucide-react";
import { RiskBadge } from "@/components/console/RiskBadge";

interface WardForecastStripProps {
  forecast: any;
  showcase: any;
}

export function WardForecastStrip({ forecast, showcase }: WardForecastStripProps) {
  const days = forecast?.days;
  if (!days || !Array.isArray(days) || days.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Next 5 Days Forecast
      </h3>
      <div className="custom-scrollbar flex gap-2.5 overflow-x-auto overscroll-x-contain pb-3 snap-x snap-mandatory -mx-1 px-1">
        {days.slice(0, 5).map((d: any, i: number) => {
          const scDay = showcase?.days?.find((s: any) => s.forecastDate === d.date) ?? showcase?.days?.[i] ?? null;
          const scSum = scDay?.summary ?? null;
          const utciVal = d.utciMax ?? scSum?.utciMax ?? null;
          const humidityVal = scSum?.humidityAvg ?? null;
          const windVal = scSum?.windAvg ?? null;
          const solarVal = scSum?.solarAvg ?? null;
          const htsiVal = d.htsiMax ?? scSum?.htsiMax ?? (typeof d.risk === "number" ? d.risk * 100 : null);

          return (
            <div
              key={d.date || i}
              className={`flex min-w-[310px] snap-start flex-col gap-2.5 rounded-xl border p-3.5 shadow-xs transition-shadow hover:shadow-sm ${
                i === 0 ? "bg-primary/5 border-primary/20" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {new Date(d.date).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {i === 0
                      ? "Today"
                      : new Date(d.date).toLocaleDateString("en-IN", {
                          weekday: "short",
                        })}
                  </p>
                </div>
                <RiskBadge category={d.category} />
              </div>

              {/* 4x2 Grid showing ALL forecast heat metrics & microclimate */}
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">Temp</p>
                  <p className="text-xs font-bold tabular-nums">
                    {d.tempMax?.toFixed(0) ?? "-"}°
                    <span className="text-[10px] font-normal text-muted-foreground">
                      /{d.tempMin?.toFixed(0) ?? "-"}°
                    </span>
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">WBGT</p>
                  <p className="text-xs font-bold tabular-nums">
                    {d.wbgtMax ? `${d.wbgtMax.toFixed(1)}°` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">HI</p>
                  <p className="text-xs font-bold tabular-nums">
                    {d.heatIndexMax ? `${d.heatIndexMax.toFixed(1)}°` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">UTCI</p>
                  <p className="text-xs font-bold tabular-nums">
                    {utciVal ? `${Number(utciVal).toFixed(1)}°` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">Humidity</p>
                  <p className="text-xs font-bold tabular-nums">
                    {humidityVal ? `${Number(humidityVal).toFixed(0)}%` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">Wind</p>
                  <p className="text-xs font-bold tabular-nums">
                    {windVal ? `${Number(windVal).toFixed(1)}m/s` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">Solar</p>
                  <p className="text-xs font-bold tabular-nums">
                    {solarVal ? `${Number(solarVal).toFixed(0)}W` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">HTSI</p>
                  <p className="text-xs font-bold tabular-nums">
                    {htsiVal ? Number(htsiVal).toFixed(1) : "-"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5 text-xs">
                <span className="font-semibold text-muted-foreground">
                  Mortality Risk
                </span>
                {d.mortality ? (
                  <span className="flex items-center gap-1 font-bold text-foreground">
                    <HeartPulse className="h-3.5 w-3.5 text-red-500" /> {d.mortality.index}/100 ({d.mortality.band})
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
