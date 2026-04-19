import { ScrollArea } from "@/components/ui/scroll-area";
import type { HealthRecord } from "@/lib/parser";

const fmt = (n: number | null, digits = 0) =>
  n === null || !Number.isFinite(n) ? "—" : digits ? n.toFixed(digits) : String(Math.round(n));

interface Props {
  records: HealthRecord[];
}

export const RecordsTable = ({ records }: Props) => (
  <div className="overflow-hidden rounded-3xl border border-border bg-card-gradient shadow-card">
    <div className="flex items-center justify-between border-b border-border px-5 py-3">
      <h3 className="text-sm font-semibold">
        Recent records <span className="ml-1 text-muted-foreground">({records.length})</span>
      </h3>
    </div>
    <ScrollArea className="h-[340px]">
      <table className="w-full font-mono-tabular text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur">
          <tr className="text-left text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Time</th>
            <th className="px-2 py-2.5 font-medium">Fg</th>
            <th className="px-2 py-2.5 font-medium">Lead</th>
            <th className="px-2 py-2.5 font-medium">ECG</th>
            <th className="px-2 py-2.5 font-medium">HR</th>
            <th className="px-2 py-2.5 font-medium">SpO₂</th>
            <th className="px-2 py-2.5 font-medium">MAX</th>
            <th className="px-2 py-2.5 font-medium">Msg</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                No records yet — connect a device to start.
              </td>
            </tr>
          )}
          {records.map((r, i) => (
            <tr key={`${r.ts}-${i}`} className="border-t border-border/60 transition-colors hover:bg-muted/40">
              <td className="px-4 py-1.5 text-muted-foreground">
                {new Date(r.ts).toLocaleTimeString(undefined, { hour12: false })}
              </td>
              <td className="px-2 py-1.5">{fmt(r.finger_detected)}</td>
              <td className="px-2 py-1.5">{fmt(r.lead_on)}</td>
              <td className="px-2 py-1.5">{fmt(r.ecg)}</td>
              <td className="px-2 py-1.5">{fmt(r.hr, 1)}</td>
              <td className="px-2 py-1.5">{fmt(r.spo2, 1)}</td>
              <td className="px-2 py-1.5">{fmt(r.max30103)}</td>
              <td className="max-w-[180px] truncate px-2 py-1.5 text-muted-foreground">{r.msg ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  </div>
);
