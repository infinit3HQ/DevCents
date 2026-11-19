import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal, Section, SectionHeading, SectionLabel } from "./primitives";

type Mark = "yes" | "no" | "partial";

const COLUMNS = ["DevCents", "Hosted apps", "Spreadsheets"] as const;

const ROWS: readonly { label: string; marks: readonly [Mark, Mark, Mark] }[] = [
  { label: "Data on your own server", marks: ["yes", "no", "yes"] },
  { label: "Client-side encryption", marks: ["yes", "no", "no"] },
  { label: "No subscription", marks: ["yes", "no", "yes"] },
  { label: "Biometric unlock", marks: ["yes", "yes", "no"] },
  { label: "Multi-currency", marks: ["yes", "partial", "partial"] },
  { label: "AI assistant (MCP)", marks: ["yes", "no", "no"] },
];

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === "yes") return <Check className="h-4 w-4 text-primary" aria-label="Yes" />;
  if (mark === "partial") return <Minus className="h-4 w-4 text-amber-400/80" aria-label="Partial" />;
  return <X className="h-4 w-4 text-muted-foreground" aria-label="No" />;
}

export function Comparison() {
  return (
    <Section id="compare" className="bg-card/30">
      <Reveal className="max-w-2xl">
        <SectionLabel index="04">compare</SectionLabel>
        <SectionHeading>How it stacks up.</SectionHeading>
      </Reveal>

      <Reveal delay={0.1} className="mt-12 overflow-x-auto border border-border">
        <table className="w-full min-w-[520px] font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <th className="px-5 py-3 text-left font-normal">feature</th>
              {COLUMNS.map((col, i) => (
                <th
                  key={col}
                  className={cn("px-5 py-3 text-center font-normal", i === 0 && "text-primary bg-primary/5")}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => (
              <tr key={row.label} className="tr-hover">
                <td className="px-5 py-3.5">{row.label}</td>
                {row.marks.map((mark, i) => (
                  <td key={i} className={cn("px-5 py-3.5", i === 0 && "bg-primary/5")}>
                    <div className="flex justify-center">
                      <MarkIcon mark={mark} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </Section>
  );
}
