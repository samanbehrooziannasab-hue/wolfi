function asArr<T = any>(v: any): T[] { return Array.isArray(v) ? v : []; }
import { useId } from "react";

type Props = {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  entry?: number | null;
};

/**
 * Minimal dependency-free SVG area/line chart. Used for position P&L curves and
 * market sparklines so the dashboard stays light (no charting library).
 */
export function SparkChart({
  data,
  width = 240,
  height = 64,
  positive = true,
  entry = null,
}: Props) {
  const gid = useId().replace(/[:]/g, "");
  const stroke = positive ? "#34d399" : "#f87171";
  const fill = positive ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.22)";

  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#1f2937" strokeWidth="1" />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 4;
  const innerH = height - pad * 2;

  const pts = asArr(data).map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  const entryY =
    entry != null && entry >= min && entry <= max
      ? pad + innerH - ((entry - min) / span) * innerH
      : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {entryY != null && (
        <line
          x1="0"
          y1={entryY}
          x2={width}
          y2={entryY}
          stroke={positive ? "#34d399" : "#f87171"}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.6"
        />
      )}
    </svg>
  );
}
