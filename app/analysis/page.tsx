"use client";

import useSWR from "swr";
import { TopBar } from "@/components/console/TopBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { WardAnalysis } from "@/components/console/WardAnalysis";
import { BarChart3 } from "lucide-react";
import { useWard } from "@/lib/wardContext";
import { useSearchParams } from "next/navigation";
import { useState, useMemo, Suspense } from "react";

export const dynamic = "force-dynamic";

const jsonFetch = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

function AnalysisContent() {
  const { selectedId: ctxId } = useWard();
  const searchParams = useSearchParams();
  const wardParam = searchParams.get("ward");
  const selectedId = wardParam ? Number(wardParam) : ctxId;
  const [search, setSearch] = useState("");
  const { data: heatmap } = useSWR("/api/wards/heatmap", jsonFetch);
  const wards = (heatmap as any)?.wards ?? [];
  const selectedWard = wards.find((w: any) => w.wardId === selectedId)?.ward ?? wards.find((w: any) => w.ward === selectedId)?.ward ?? null;
  const wardData = wards.find((w: any) => w.wardId === selectedId || w.ward === selectedId);
  const cityMean = useMemo(() => {
    const rs = wards.filter((w: any) => w.riskScore != null).map((w: any) => w.riskScore * 100);
    if (!rs.length) return null;
    return rs.reduce((s: number, v: number) => s + v, 0) / rs.length;
  }, [wards]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <TopBar watchLabel="Analysis" syncedAt={null} syncDetail={null} timezone="Asia/Kolkata" onSendAlert={() => {}} searchQuery={search} onSearchChange={setSearch} wards={wards.map((w: any) => ({ ward: w.ward, wardName: w.wardName, wardId: w.wardId }))} onSelectWard={() => {}} />
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <main className="custom-scrollbar flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          <div className="mx-auto max-w-[1280px]">
            <PageHeader
              icon={BarChart3}
              iconClassName="text-primary"
              title="Ward Analysis"
              subtitle="Deep dive for the selected ward - tap a ward on Maps to switch"
            />
            <div className="mt-6">
              <WardAnalysis wardId={selectedId} ward={selectedWard} cityMean={cityMean} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="flex h-[100dvh] items-center justify-center">Loading analysis…</div>}>
      <AnalysisContent />
    </Suspense>
  );
}
