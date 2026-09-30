"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Bell,
  Send,
  CheckCircle2,
  ShieldAlert,
  Thermometer,
  Flame,
  Users,
  Info,
  ChevronDown,
  Check,
  MapPin,
  Building2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StaticZone } from "@/lib/geo/zones";
import { wardDisplayName } from "@/lib/geo/wardLocalities";

export interface AlertInfoType {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const INFO_TYPES: AlertInfoType[] = [
  {
    id: "htsi",
    label: "HTSI (Heat Stress Index)",
    description: "Real-time heat stress index threshold breaches",
    icon: <Flame className="h-3.5 w-3.5 text-orange-500" />,
  },
  {
    id: "risk",
    label: "Extreme Risk Warnings",
    description: "Critical ward risk score alerts",
    icon: <ShieldAlert className="h-3.5 w-3.5 text-red-500" />,
  },
  {
    id: "vulnerability",
    label: "Vulnerability Updates",
    description: "Socioeconomic and population vulnerability impacts",
    icon: <Users className="h-3.5 w-3.5 text-violet-500" />,
  },
  {
    id: "weather",
    label: "Microclimate Drivers",
    description: "Temperature, humidity, solar radiation & wind speed",
    icon: <Thermometer className="h-3.5 w-3.5 text-sky-500" />,
  },
  {
    id: "emergency",
    label: "Relief & Shelter Advisories",
    description: "Cooling centers and heat health emergency actions",
    icon: <Info className="h-3.5 w-3.5 text-emerald-500" />,
  },
];

export function AlertComposer({
  open,
  onClose,
  zones = [],
  districts = [],
  selectedZone = null,
  onSubscribedSuccess,
}: {
  open: boolean;
  onClose: () => void;
  zones?: StaticZone[];
  districts?: Array<{ code: string; name: string }>;
  selectedZone?: StaticZone | null;
  onSubscribedSuccess?: (ulid: string, email: string) => void;
}) {
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<string>("");
  const [selectedUlid, setSelectedUlid] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["htsi", "risk", "weather"]);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const [subscribedResult, setSubscribedResult] = useState<{
    wardName: string;
    districtName: string;
    email: string;
    types: string[];
    simulated: boolean;
  } | null>(null);

  // Load cached email from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ahvaan_alert_email");
      if (saved) setEmail(saved);
    }
  }, []);

  // Sync district & ward selection when modal opens or selectedZone changes
  useEffect(() => {
    if (open) {
      setError(null);
      setSubscribedResult(null);
      setBusy(false);
      setDistrictDropdownOpen(false);
      setWardDropdownOpen(false);

      if (selectedZone) {
        setSelectedDistrictCode(selectedZone.districtCode);
        setSelectedUlid(selectedZone.ulid);
      } else if (districts.length > 0) {
        setSelectedDistrictCode(districts[0].code);
      }
    }
  }, [open, selectedZone, districts]);

  // Filter zones by selected district
  const districtZones = useMemo(() => {
    if (!selectedDistrictCode) return zones;
    return zones.filter((z) => z.districtCode === selectedDistrictCode);
  }, [zones, selectedDistrictCode]);

  // If district changes and selected zone isn't in it, select first ward
  useEffect(() => {
    if (districtZones.length > 0 && !districtZones.some((z) => z.ulid === selectedUlid)) {
      setSelectedUlid(districtZones[0].ulid);
    }
  }, [districtZones, selectedUlid]);

  const activeZone = useMemo(() => {
    return zones.find((z) => z.ulid === selectedUlid) || selectedZone || districtZones[0] || null;
  }, [zones, selectedUlid, selectedZone, districtZones]);

  const currentDistrictName = useMemo(() => {
    return districts.find((d) => d.code === selectedDistrictCode)?.name ?? "Select District";
  }, [districts, selectedDistrictCode]);

  // Update default summary text
  useEffect(() => {
    if (activeZone) {
      const wardLabel = wardDisplayName(activeZone.ward, activeZone.name);
      const chosenLabels = INFO_TYPES.filter((t) => selectedTypes.includes(t.id))
        .map((t) => t.label)
        .join(", ");
      setMessage(
        `Ward: ${wardLabel} (${activeZone.district})\nAlert Categories: ${chosenLabels || "General Alert"}`,
      );
    }
  }, [activeZone, selectedTypes]);

  const toggleType = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId)
        ? prev.length > 1
          ? prev.filter((id) => id !== typeId)
          : prev
        : [...prev, typeId],
    );
  };

  const handleSubscribe = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!activeZone) {
      setError("Please select a ward.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // Save email locally for convenience
      if (typeof window !== "undefined") {
        localStorage.setItem("ahvaan_alert_email", trimmedEmail);
      }

      // Call API to subscribe & dispatch alert
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ulid: activeZone.ulid,
          email: trimmedEmail,
          infoTypes: selectedTypes,
          message,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to process alert subscription.");

      const wardLabel = wardDisplayName(activeZone.ward, activeZone.name);
      const districtLabel = activeZone.district;

      setSubscribedResult({
        wardName: wardLabel,
        districtName: districtLabel,
        email: trimmedEmail,
        types: selectedTypes,
        simulated: !!data.simulated,
      });

      if (onSubscribedSuccess) {
        onSubscribedSuccess(activeZone.ulid, trimmedEmail);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Subscription failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-[101] w-full max-w-lg overflow-hidden rounded-3xl border-2 border-primary/20 bg-card p-0 shadow-2xl max-h-[90vh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-red-500/10 via-amber-500/5 to-transparent px-5 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-foreground">
                    Subscribe to Ward Email Alerts
                  </h3>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-muted"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Content */}
            <div className="custom-scrollbar max-h-[80vh] overflow-y-auto p-5">
              {subscribedResult ? (
                /* SUCCESS CONFIRMATION VIEW */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4 text-center py-2"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>

                  <div>
                    <span className="inline-block rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
                      Subscribed Successfully
                    </span>
                    <h4 className="text-xl font-black tracking-tight text-foreground">
                      {subscribedResult.wardName}
                    </h4>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {subscribedResult.districtName}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left space-y-2 text-xs">
                    <div className="flex justify-between border-b border-emerald-500/10 pb-2">
                      <span className="font-semibold text-muted-foreground">Recipient Email:</span>
                      <span className="font-bold text-foreground tabular-nums">{subscribedResult.email}</span>
                    </div>
                    <div className="flex justify-between border-b border-emerald-500/10 pb-2">
                      <span className="font-semibold text-muted-foreground">Alert Delivery:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">Real-time Email</span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground block mb-1">Subscribed Information Types:</span>
                      <div className="flex flex-wrap gap-1">
                        {INFO_TYPES.filter((t) => subscribedResult.types.includes(t.id)).map((t) => (
                          <span
                            key={t.id}
                            className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-bold text-foreground"
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {subscribedResult.simulated
                      ? "Demo mode: Alert registered and email notification logged."
                      : "An automated confirmation email has been sent to your inbox."}
                  </p>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl"
                      onClick={() => setSubscribedResult(null)}
                    >
                      Subscribe Another Ward
                    </Button>
                    <Button
                      className="flex-1 rounded-xl bg-red-600 text-white hover:bg-red-700"
                      onClick={onClose}
                    >
                      Done
                    </Button>
                  </div>
                </motion.div>
              ) : (
                /* FORM VIEW */
                <div className="space-y-4">
                  {/* Step 1: Select District & Ward */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      1. Select District & Ward
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* District Dropdown */}
                      <div className="relative">
                        <span className="text-[11px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-red-500" /> District
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDistrictDropdownOpen((v) => !v);
                            setWardDropdownOpen(false);
                          }}
                          className="flex h-10 w-full items-center justify-between rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground shadow-xs hover:border-primary/50 focus:outline-none transition-all"
                        >
                          <span className="truncate">{currentDistrictName}</span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                              districtDropdownOpen ? "rotate-180 text-primary" : ""
                            }`}
                          />
                        </button>

                        <AnimatePresence>
                          {districtDropdownOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setDistrictDropdownOpen(false)}
                              />
                              <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl backdrop-blur-xl custom-scrollbar"
                              >
                                {districts.map((d) => {
                                  const isSelected = d.code === selectedDistrictCode;
                                  return (
                                    <button
                                      key={d.code}
                                      type="button"
                                      onClick={() => {
                                        setSelectedDistrictCode(d.code);
                                        setDistrictDropdownOpen(false);
                                      }}
                                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                                        isSelected
                                          ? "bg-red-500/10 text-red-600 dark:text-red-400 font-bold"
                                          : "text-popover-foreground hover:bg-muted font-medium"
                                      }`}
                                    >
                                      <span>{d.name}</span>
                                      {isSelected && <Check className="h-3.5 w-3.5 text-red-500" />}
                                    </button>
                                  );
                                })}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Ward Dropdown */}
                      <div className="relative">
                        <span className="text-[11px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-amber-500" /> Ward / Zone
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setWardDropdownOpen((v) => !v);
                            setDistrictDropdownOpen(false);
                          }}
                          className="flex h-10 w-full items-center justify-between rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground shadow-xs hover:border-primary/50 focus:outline-none transition-all"
                        >
                          <span className="truncate">
                            {activeZone ? wardDisplayName(activeZone.ward, activeZone.name) : "Select Ward"}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {activeZone && (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {activeZone.heatpoints.length} hp
                              </span>
                            )}
                            <ChevronDown
                              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                                wardDropdownOpen ? "rotate-180 text-primary" : ""
                              }`}
                            />
                          </div>
                        </button>

                        <AnimatePresence>
                          {wardDropdownOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setWardDropdownOpen(false)}
                              />
                              <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-52 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl backdrop-blur-xl custom-scrollbar"
                              >
                                {districtZones.map((z) => {
                                  const isSelected = z.ulid === selectedUlid;
                                  const name = wardDisplayName(z.ward, z.name);
                                  return (
                                    <button
                                      key={z.ulid}
                                      type="button"
                                      onClick={() => {
                                        setSelectedUlid(z.ulid);
                                        setWardDropdownOpen(false);
                                      }}
                                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                                        isSelected
                                          ? "bg-red-500/10 text-red-600 dark:text-red-400 font-bold"
                                          : "text-popover-foreground hover:bg-muted font-medium"
                                      }`}
                                    >
                                      <span className="truncate">{name}</span>
                                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        <span className="text-[10px] text-muted-foreground">
                                          {z.heatpoints.length} hp
                                        </span>
                                        {isSelected && <Check className="h-3.5 w-3.5 text-red-500" />}
                                      </div>
                                    </button>
                                  );
                                })}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Email Input */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      2. Recipient Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="officer@kmc.gov.in or your.name@example.com"
                      className="h-10 w-full rounded-xl border border-border bg-card px-3.5 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Step 3: Choose Information Types */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      3. Choose Alert Information Types
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {INFO_TYPES.map((t) => {
                        const active = selectedTypes.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleType(t.id)}
                            className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                              active
                                ? "border-red-500/50 bg-red-500/10 shadow-xs"
                                : "border-border/60 bg-card hover:bg-muted/40"
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">{t.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-foreground">
                                  {t.label}
                                </span>
                                <span
                                  className={`h-4 w-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                    active
                                      ? "bg-red-600 border-red-600 text-white"
                                      : "border-muted-foreground/40 bg-transparent text-transparent"
                                  }`}
                                >
                                  ✓
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {t.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Alert Dispatch Summary (Read-Only) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground" /> 4. Alert Dispatch Summary
                      </label>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Auto-Generated (Read-Only)
                      </span>
                    </div>
                    <textarea
                      readOnly
                      value={message}
                      rows={3}
                      className="custom-scrollbar w-full rounded-xl border border-border/70 bg-muted/20 p-2.5 text-xs text-muted-foreground select-none focus:outline-none cursor-not-allowed leading-relaxed font-mono"
                    />
                  </div>

                  {error && (
                    <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}

                  {/* Subscribe Action Button */}
                  <Button
                    className="w-full rounded-xl bg-red-600 py-5 text-sm font-bold text-white shadow-lg transition-transform active:scale-[0.99] hover:bg-red-700 disabled:opacity-60"
                    disabled={busy || !email.trim()}
                    onClick={handleSubscribe}
                  >
                    <Send className="h-4 w-4" /> {busy ? "Subscribing..." : "Subscribe to Ward Email Alerts"}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
