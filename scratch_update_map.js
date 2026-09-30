const fs = require('fs');

let code = fs.readFileSync('components/map/KolkataMap.tsx', 'utf8');

// 1. Fix locationGlows culling
const oldGlows = `    if (heatpoints && heatpoints.length > 0) {
      const stride = Math.max(1, Math.ceil(heatpoints.length / 2000));
      const out: Array<{ id: string; x: number; y: number; r: number; step: 1 | 2 | 3 | 4 | 5 }> = [];
      for (let i = 0; i < heatpoints.length; i += stride) {
        const hp = heatpoints[i];
        const step = tileStep(hp.id, hp.zoneId);
        if (step === undefined) continue;
        if (!Number.isFinite(hp.lon) || !Number.isFinite(hp.lat)) continue;
        const [sx, sy] = project(hp.lon, hp.lat, bounds);
        out.push({ id: \`hp-\${hp.id}\`, x: sx, y: sy, r: 9 + ((step - 1) / 4) * 9, step });
      }
      return out;
    }`;

const newGlows = `    const m = 40;
    const vx0 = vbX - m, vx1 = vbX + vbW + m;
    const vy0 = vbY - m, vy1 = vbY + vbH + m;

    if (heatpoints && heatpoints.length > 0) {
      const out: Array<{ id: string; x: number; y: number; r: number; step: 1 | 2 | 3 | 4 | 5 }> = [];
      for (let i = 0; i < heatpoints.length; i++) {
        const hp = heatpoints[i];
        if (!Number.isFinite(hp.lon) || !Number.isFinite(hp.lat)) continue;
        const [sx, sy] = project(hp.lon, hp.lat, bounds);
        if (sx < vx0 || sx > vx1 || sy < vy0 || sy > vy1) continue;
        const step = tileStep(hp.id, hp.zoneId);
        if (step === undefined) continue;
        out.push({ id: \`hp-\${hp.id}\`, x: sx, y: sy, r: 12 + ((step - 1) / 4) * 10, step });
      }
      return out;
    }`;

code = code.replace(oldGlows.replace(/\r\n/g, '\n'), newGlows);
code = code.replace(oldGlows.replace(/\n/g, '\r\n'), newGlows);

// Update dependencies of locationGlows
code = code.replace(
  `], [showGradient, visibleCells, bounds, paintStepOf, heatpoints, tileValues, layer, boxById]);`,
  `], [showGradient, visibleCells, bounds, paintStepOf, heatpoints, tileValues, layer, boxById, vbX, vbY, vbW, vbH]);`
);
code = code.replace(
  `], [showGradient, visibleCells, bounds, paintStepOf, heatpoints, tileValues, layer, boxById]);\r\n`,
  `], [showGradient, visibleCells, bounds, paintStepOf, heatpoints, tileValues, layer, boxById, vbX, vbY, vbW, vbH]);\r\n`
);

// 2. Fix GPS dot responsiveness with zoom
const oldGps = `<g style={{ pointerEvents: "none" }}>
                <circle cx={gx} cy={gy} r={14} fill="#2563eb" opacity={0.35} className="gps-halo" />
                <circle cx={gx} cy={gy} r={6} fill="#2563eb" stroke="#ffffff" strokeWidth={2} />
              </g>`;

const newGps = `(() => {
                const rHalo = labelUnits(14);
                const rDot = labelUnits(6);
                const sw = labelUnits(2);
                return (
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx={gx} cy={gy} r={rHalo} fill="#2563eb" opacity={0.35} className="gps-halo" />
                    <circle cx={gx} cy={gy} r={rDot} fill="#2563eb" stroke="#ffffff" strokeWidth={sw} />
                  </g>
                );
              })()`;

code = code.replace(oldGps.replace(/\r\n/g, '\n'), newGps);
code = code.replace(oldGps.replace(/\n/g, '\r\n'), newGps);

// 3. Add visibleLabels decluttering hook
const declutterHook = `  /** Decluttered Google-Maps-style label placement with spatial collision prevention */
  const visibleLabels = useMemo(() => {
    const candidates = visibleCells
      .map((c) => {
        const b = boxById.get(c.zoneId);
        if (!b || b.empty) return null;
        const isEmph =
          c.zoneId === selectedId || c.zoneId === hoveredId || isMatch(c);
        return { cell: c, box: b, isEmph };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    candidates.sort((a, b) => {
      if (a.isEmph !== b.isEmph) return a.isEmph ? -1 : 1;
      return (b.cell.ring.length || 0) - (a.cell.ring.length || 0);
    });

    const placedCenters: Array<{ x: number; y: number }> = [];
    const minOverlapDist = z <= 2.2 ? 85 : z <= 3.5 ? 65 : 45;

    const out: Array<{
      cell: MapZone;
      sx: number;
      sy: number;
      isEmph: boolean;
      mainLabel: string;
      full: string;
      showLoc: boolean;
    }> = [];

    for (const { cell: c, box: b, isEmph } of candidates) {
      if (!isEmph) {
        if (z < 2.0) continue;
        if (z < 3.2 && c.ring.length < 35) continue;
      }

      const screenX = ((b.pcx - vbX) / vbW) * (boxW || W);
      const screenY = ((b.pcy - vbY) / vbH) * (boxH || H);

      if (!isEmph) {
        let collides = false;
        for (const p of placedCenters) {
          if (Math.hypot(p.x - screenX, p.y - screenY) < minOverlapDist) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
      }

      placedCenters.push({ x: screenX, y: screenY });

      const full = zoneLabel(c);
      const mainLabel = full.length > 14 ? full.slice(0, 13) + "…" : full;
      const showLoc = isEmph && full.length > 14;

      out.push({
        cell: c,
        sx: b.pcx,
        sy: b.pcy,
        isEmph,
        mainLabel,
        full,
        showLoc,
      });
    }

    return out;
  }, [visibleCells, boxById, selectedId, hoveredId, isMatch, z, vbX, vbY, vbW, vbH, boxW, boxH]);
`;

// Insert visibleLabels hook before label rendering section
code = code.replace(
  `        {/* Zone labels — Google-Maps-style:`,
  declutterHook + `\n        {/* Zone labels — Google-Maps-style:`
);

// Update label rendering to use visibleLabels
const oldLabelLoop = `{visibleCells.map((c) => {
          const b = boxById.get(c.zoneId);
          if (!b || b.empty) return null;
          const sx = b.pcx;
          const sy = b.pcy;
          const isEmph =
            c.zoneId === selectedId ||
            c.zoneId === hoveredId ||
            isMatch(c);
          const isWard = c.kind === "WARD" && c.ward !== null;
          const isTown = c.kind === "TOWN_COMBINED";
          // Priority gating by zoom.
          if (!isEmph) {
            if (isWard) {
              if (z <= 1.4) return null;
            } else if (isTown) {
              if (z <= 2.0) return null;
            } else {
              if (z <= 2.8) return null;
            }
            // Hide dense small zones' labels at low zoom to avoid clutter.
            if (c.ring.length < 40 && z <= 2.2) return null;
          }
          const full = zoneLabel(c);
          const mainLabel =
            full.length > 12 ? full.slice(0, 11) + "…" : full;
          // Sub-line: full name, emphasized zones only.
          const showLoc = isEmph && full.length > 12;
          const ink = "#ffffff";
          return (
            <g key={\`lbl-\${c.zoneId}\`} style={{ pointerEvents: "none" }}>
              <text
                x={sx}
                y={showLoc ? sy - labelUnits(4) : sy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelUnits(10)}
                fontWeight={isEmph ? 800 : 600}
                fill={ink}
                className="map-label"
                strokeWidth={labelUnits(1.4)}
                style={{
                  fontFamily: "var(--font-sans), Archivo, sans-serif",
                  userSelect: "none",
                }}
              >
                {mainLabel}
              </text>
              {showLoc && (
                <text
                  x={sx}
                  y={sy + labelUnits(7)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={labelUnits(8)}
                  fontWeight={600}
                  fill={ink}
                  opacity={0.85}
                  className="map-label"
                  strokeWidth={labelUnits(1.2)}
                  style={{
                    fontFamily: "var(--font-sans), Archivo, sans-serif",
                    userSelect: "none",
                  }}
                >
                  {full.length > 26 ? full.slice(0, 25) + "…" : full}
                </text>
              )}
            </g>
          );
        })}`;

const newLabelLoop = `{visibleLabels.map(({ cell: c, sx, sy, isEmph, mainLabel, full, showLoc }) => {
          const ink = "#ffffff";
          return (
            <g key={\`lbl-\${c.zoneId}\`} style={{ pointerEvents: "none" }}>
              <text
                x={sx}
                y={showLoc ? sy - labelUnits(4) : sy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelUnits(10)}
                fontWeight={isEmph ? 800 : 600}
                fill={ink}
                className="map-label"
                strokeWidth={labelUnits(1.4)}
                style={{
                  fontFamily: "var(--font-sans), Archivo, sans-serif",
                  userSelect: "none",
                }}
              >
                {mainLabel}
              </text>
              {showLoc && (
                <text
                  x={sx}
                  y={sy + labelUnits(7)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={labelUnits(8)}
                  fontWeight={600}
                  fill={ink}
                  opacity={0.85}
                  className="map-label"
                  strokeWidth={labelUnits(1.2)}
                  style={{
                    fontFamily: "var(--font-sans), Archivo, sans-serif",
                    userSelect: "none",
                  }}
                >
                  {full.length > 26 ? full.slice(0, 25) + "…" : full}
                </text>
              )}
            </g>
          );
        })}`;

code = code.replace(oldLabelLoop.replace(/\r\n/g, '\n'), newLabelLoop);
code = code.replace(oldLabelLoop.replace(/\n/g, '\r\n'), newLabelLoop);

fs.writeFileSync('components/map/KolkataMap.tsx', code);
console.log('Successfully updated KolkataMap.tsx');
