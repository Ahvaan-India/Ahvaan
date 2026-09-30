"use client";

import { useState, useMemo } from "react";
import {
  Bell,
  AlertTriangle,
  Flame,
  Search,
  Filter,
  ArrowRight,
  Menu,
  X,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Send,
  UserCheck,
  Building2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeftNav } from "@/components/layout/LeftNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { useNav } from "@/lib/navContext";
import { useWard } from "@/lib/wardContext";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface LoggedAlert {
  id: string;
  timestamp: string;
  zoneUlid: string;
  zoneName: string;
  district: string;
  wardNumber: number | null;
  severity: "EXTREME" | "SEVERE" | "MODERATE" | "ADVISORY";
  channel: "EMAIL_BROADCAST" | "SMS_DISPATCH" | "AUTOMATED_TRIGGER" | "MANUAL";
  subject: string;
  message: string;
  recipients: string;
  recipientCount: number;
  metrics: {
    htsi: number;
    wbgt: number;
    utci: number;
  };
}

const LOGGED_ALERTS: LoggedAlert[] = [
  {
    id: "ALT-2026-1004-01",
    timestamp: "2026-10-04 14:30 IST",
    zoneUlid: "ZONE_KOL_W058",
    zoneName: "Ward 58 — Dhapa & Tangra Industrial Belt",
    district: "Kolkata",
    wardNumber: 58,
    severity: "EXTREME",
    channel: "EMAIL_BROADCAST",
    subject: "RED ALERT: Extreme Heat Stress Warning — Ward 58",
    message: "UTCI has breached 41.8°C with HTSI at 82.4%. High heat exposure detected in industrial worker zones around Tangra. Emergency cooling centers activated.",
    recipients: "Ward Executive Officers, Municipal Health Dept, Local Health Centers",
    recipientCount: 18,
    metrics: { htsi: 82.4, wbgt: 33.8, utci: 41.8 },
  },
  {
    id: "ALT-2026-1004-02",
    timestamp: "2026-10-04 13:15 IST",
    zoneUlid: "ZONE_KOL_W066",
    zoneName: "Ward 66 — Topsia & Tiljala South",
    district: "Kolkata",
    wardNumber: 66,
    severity: "EXTREME",
    channel: "AUTOMATED_TRIGGER",
    subject: "AUTOMATED WARNING: Severe HTSI Spike in Ward 66",
    message: "WBGT threshold exceeding 34.1°C detected. Direct solar radiation at 780 W/m². Hydration protocols initiated for outdoor laborers.",
    recipients: "Disaster Management Cell, Ward Health Inspectors",
    recipientCount: 12,
    metrics: { htsi: 79.8, wbgt: 34.1, utci: 40.9 },
  },
  {
    id: "ALT-2026-1004-03",
    timestamp: "2026-10-04 11:45 IST",
    zoneUlid: "ZONE_HWH_W012",
    zoneName: "Ward 12 — Salkia North & Howrah Station Zone",
    district: "Howrah",
    wardNumber: 12,
    severity: "SEVERE",
    channel: "SMS_DISPATCH",
    subject: "SEVERE HEAT ADVISORY: Howrah Station Corridor",
    message: "Heavy pedestrian footfall zone experiencing 38.5°C dry bulb and 72% relative humidity. High heat index advisory issued to Howrah Municipal Corp.",
    recipients: "Howrah Municipal Corp Officers, Traffic Police Control",
    recipientCount: 24,
    metrics: { htsi: 74.2, wbgt: 32.5, utci: 39.2 },
  },
  {
    id: "ALT-2026-1003-04",
    timestamp: "2026-10-03 15:00 IST",
    zoneUlid: "ZONE_N24_W022",
    zoneName: "Ward 22 — Rajarhat Gopalpur East",
    district: "North 24 Parganas",
    wardNumber: 22,
    severity: "SEVERE",
    channel: "EMAIL_BROADCAST",
    subject: "HEAT RISK BULLETIN: North 24 Parganas Urban Fringe",
    message: "High vulnerability index (78/100) coupled with 39.1°C UTCI forecast. Field teams dispatched to distribute oral rehydration salts (ORS).",
    recipients: "Block Development Officer, Community Health Workers",
    recipientCount: 31,
    metrics: { htsi: 71.5, wbgt: 31.8, utci: 39.1 },
  },
  {
    id: "ALT-2026-1003-05",
    timestamp: "2026-10-03 12:30 IST",
    zoneUlid: "ZONE_KOL_W014",
    zoneName: "Ward 14 — Ultadanga & Maniktala Main Rd",
    district: "Kolkata",
    wardNumber: 14,
    severity: "MODERATE",
    channel: "AUTOMATED_TRIGGER",
    subject: "HEAT ADVISORY: Mid-day Temperature Peak",
    message: "Moderate heat strain advisory. Ward 14 humidity levels at 68%. Senior citizens and vulnerable groups advised to remain indoors 12:00–15:00.",
    recipients: "Ward Health Center 14, Resident Welfare Associations",
    recipientCount: 15,
    metrics: { htsi: 64.1, wbgt: 29.8, utci: 36.4 },
  },
  {
    id: "ALT-2026-1002-06",
    timestamp: "2026-10-02 14:10 IST",
    zoneUlid: "ZONE_KOL_W088",
    zoneName: "Ward 88 — Kalighat & Tollygunge Fringe",
    district: "Kolkata",
    wardNumber: 88,
    severity: "ADVISORY",
    channel: "MANUAL",
    subject: "PRECAUTIONARY NOTICE: Weekend Heat Index Advisory",
    message: "Forecast predicts WBGT near 30.5°C for the upcoming afternoon. Urban heat island mitigation guidelines shared with local ward supervisors.",
    recipients: "Kolkata Municipal Corp Environment Dept",
    recipientCount: 8,
    metrics: { htsi: 58.9, wbgt: 30.5, utci: 35.1 },
  },
];

const SEVERITY_CONFIG = {
  EXTREME: {
    label: "Red Alert",
    bg: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
    badge: "bg-red-600 text-white",
    icon: ShieldAlert,
  },
  SEVERE: {
    label: "Severe Warning",
    bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    badge: "bg-amber-600 text-white",
    icon: AlertTriangle,
  },
  MODERATE: {
    label: "Moderate Alert",
    bg: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    badge: "bg-yellow-600 text-white",
    icon: Flame,
  },
  ADVISORY: {
    label: "Advisory",
    bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    badge: "bg-blue-600 text-white",
    icon: Bell,
  },
};

export default function AlertsPage() {
  const { navOpen, setNavOpen } = useNav();
  const { setSelectedId } = useWard();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [districtFilter, setDistrictFilter] = useState<string>("ALL");
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  const filteredAlerts = useMemo(() => {
    return LOGGED_ALERTS.filter((item) => {
      const matchesSearch =
        !search.trim() ||
        item.subject.toLowerCase().includes(search.toLowerCase()) ||
        item.zoneName.toLowerCase().includes(search.toLowerCase()) ||
        item.message.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase());

      const matchesSeverity =
        severityFilter === "ALL" || item.severity === severityFilter;

      const matchesDistrict =
        districtFilter === "ALL" || item.district === districtFilter;

      return matchesSearch && matchesSeverity && matchesDistrict;
    });
  }, [search, severityFilter, districtFilter]);

  const stats = useMemo(() => {
    const total = LOGGED_ALERTS.length;
    const extreme = LOGGED_ALERTS.filter((a) => a.severity === "EXTREME").length;
    const severe = LOGGED_ALERTS.filter((a) => a.severity === "SEVERE").length;
    const totalRecipients = LOGGED_ALERTS.reduce((acc, a) => acc + a.recipientCount, 0);
    return { total, extreme, severe, totalRecipients };
  }, []);

  const openOnMap = (ulid: string) => {
    setSelectedId(ulid);
    router.push("/maps");
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <main className="custom-scrollbar relative flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-lg transition-colors hover:bg-muted lg:hidden"
            aria-label="Toggle menu"
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="mx-auto max-w-[1280px] space-y-6">
            <PageHeader
              icon={Bell}
              iconClassName="text-red-500"
              title="Logged Alerts & Dispatches"
              subtitle="Audit log of dispatched heat risk warnings, emergency advisories, and automated municipal broadcasts"
            />

            {/* Summary Stat Cards */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Total Dispatched
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums">
                      {stats.total}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Bell className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Red Alerts
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-red-600 dark:text-red-400">
                      {stats.extreme}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Severe Warnings
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                      {stats.severe}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Notified Officials
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums">
                      {stats.totalRecipients}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                    <UserCheck className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filter and Search Bar */}
            <Card className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by ward, zone, message or alert ID..."
                    className="h-9 w-full rounded-xl border bg-muted/40 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:bg-background focus:ring-1 focus:ring-primary"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-xl border bg-muted/30 p-1">
                    {["ALL", "EXTREME", "SEVERE", "MODERATE", "ADVISORY"].map((sev) => (
                      <button
                        key={sev}
                        onClick={() => setSeverityFilter(sev)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                          severityFilter === sev
                            ? "bg-card text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {sev === "ALL" ? "All Severities" : sev.charAt(0) + sev.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>

                  <select
                    value={districtFilter}
                    onChange={(e) => setDistrictFilter(e.target.value)}
                    className="h-9 rounded-xl border bg-card px-3 text-xs font-semibold text-foreground outline-none"
                  >
                    <option value="ALL">All Districts</option>
                    <option value="Kolkata">Kolkata</option>
                    <option value="Howrah">Howrah</option>
                    <option value="North 24 Parganas">North 24 Parganas</option>
                  </select>
                </div>
              </div>
            </Card>

            {/* Alert List */}
            <div className="space-y-3">
              {filteredAlerts.length === 0 ? (
                <Card className="p-12 text-center">
                  <Bell className="mx-auto h-8 w-8 text-muted-foreground opacity-50" />
                  <p className="mt-2 text-sm font-semibold">No alerts found matching your query</p>
                  <p className="text-xs text-muted-foreground">Try clearing filters or search terms.</p>
                </Card>
              ) : (
                filteredAlerts.map((alert) => {
                  const severityStyle = SEVERITY_CONFIG[alert.severity];
                  const SevIcon = severityStyle.icon;
                  const isExpanded = expandedAlert === alert.id;

                  return (
                    <Card
                      key={alert.id}
                      className={cn(
                        "overflow-hidden border-l-4 transition-all hover:shadow-md",
                        alert.severity === "EXTREME"
                          ? "border-l-red-600"
                          : alert.severity === "SEVERE"
                          ? "border-l-amber-500"
                          : alert.severity === "MODERATE"
                          ? "border-l-yellow-500"
                          : "border-l-blue-500",
                      )}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          {/* Left Details */}
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                                  severityStyle.badge,
                                )}
                              >
                                <SevIcon className="h-3 w-3" />
                                {severityStyle.label}
                              </span>
                              <span className="text-xs font-mono font-semibold text-muted-foreground">
                                {alert.id}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {alert.timestamp}
                              </span>
                            </div>

                            <h3 className="text-base font-bold text-foreground">
                              {alert.subject}
                            </h3>

                            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <Building2 className="h-3.5 w-3.5 text-primary" />
                              {alert.zoneName} · <span className="text-foreground">{alert.district}</span>
                            </p>
                          </div>

                          {/* Action Button */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                              onClick={() => openOnMap(alert.zoneUlid)}
                            >
                              View on Map
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Message Preview / Expanded */}
                        <div className="mt-3 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
                          <p className={cn(!isExpanded && "line-clamp-2")}>
                            {alert.message}
                          </p>
                          {alert.message.length > 120 && (
                            <button
                              onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                              className="mt-1 flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                            >
                              {isExpanded ? (
                                <>
                                  Show Less <ChevronUp className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  Read Full Dispatch Log <ChevronDown className="h-3 w-3" />
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Footer Badges & Metrics */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-4">
                            <span className="flex items-center gap-1 font-medium">
                              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                              Recipients: <strong className="text-foreground">{alert.recipients}</strong> ({alert.recipientCount})
                            </span>
                          </div>

                          <div className="flex items-center gap-3 font-mono font-semibold text-[11px] tabular-nums">
                            <span className="rounded-md bg-muted px-2 py-0.5">
                              HTSI: <span className="text-red-600 dark:text-red-400 font-bold">{(alert.metrics.htsi / 100).toFixed(2)}</span>
                            </span>
                            <span className="rounded-md bg-muted px-2 py-0.5">
                              WBGT: <span className="text-amber-600 dark:text-amber-400 font-bold">{alert.metrics.wbgt}°C</span>
                            </span>
                            <span className="rounded-md bg-muted px-2 py-0.5">
                              UTCI: <span className="text-foreground font-bold">{alert.metrics.utci}°C</span>
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
