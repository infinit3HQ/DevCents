import { Reveal, Section, SectionHeading, SectionLabel } from "./primitives";

const TRANSCRIPT = [
  { who: "you", text: "What did I spend on food last month?" },
  {
    who: "claude",
    text: "You spent $612.40 on food in October across 23 transactions. That's 14% less than September. Groceries were $418.10 and eating out was $194.30.",
  },
  { who: "you", text: "Add a $12 coffee, today." },
  { who: "claude", text: "Done. Added -12.00 USD, category food, dated 2026-11-20." },
] as const;

export function McpDemo() {
  return (
    <Section id="mcp">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
        <Reveal className="order-2 lg:order-1">
          <div className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 h-9 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>mcp::devcents</span>
              <span className="text-primary">connected</span>
            </div>
            <div className="p-5 space-y-5 font-mono text-[13px] leading-relaxed">
              {TRANSCRIPT.map((line, i) => (
                <div key={i} className="grid grid-cols-[4.5rem_1fr] gap-3">
                  <span className={line.who === "you" ? "text-primary" : "text-muted-foreground"}>
                    {line.who === "you" ? "> you" : "claude"}
                  </span>
                  <span className={line.who === "you" ? "" : "text-muted-foreground"}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="order-1 lg:order-2">
          <SectionLabel index="03">ai access</SectionLabel>
          <SectionHeading>Ask Claude about your money.</SectionHeading>
          <p className="mt-4 font-sans text-muted-foreground leading-relaxed">
            DevCents ships an MCP server. Connect Claude, Cursor or another agent
            over OAuth 2.1 or a scoped API token that expires, then ask questions
            or add entries in plain language. You can revoke access from
            Settings at any time.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}
