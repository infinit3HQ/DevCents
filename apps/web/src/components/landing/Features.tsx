import {
  Bot,
  CalendarClock,
  Coins,
  FileUp,
  Fingerprint,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Reveal, Section, SectionHeading, SectionLabel } from "./primitives";

type Feature = { key: string; title: string; desc: string; Icon: LucideIcon };

const FEATURES: readonly Feature[] = [
  {
    key: "unlock",
    title: "Biometric unlock",
    desc: "Face ID or fingerprint through WebAuthn. No passphrase prompt on your own devices.",
    Icon: Fingerprint,
  },
  {
    key: "fx",
    title: "Multi-currency",
    desc: "Log in any currency. Daily rates convert everything to your base currency.",
    Icon: Coins,
  },
  {
    key: "plan",
    title: "Planning & forecast",
    desc: "Schedule one-off and recurring entries and see your projected balance ahead of time.",
    Icon: CalendarClock,
  },
  {
    key: "import",
    title: "CSV import",
    desc: "Bring history in from a bank export. Category rules tag repeat merchants for you.",
    Icon: FileUp,
  },
  {
    key: "mcp",
    title: "Claude via MCP",
    desc: "Ask questions about your spending from Claude or Cursor with a scoped, expiring token.",
    Icon: Bot,
  },
  {
    key: "mobile",
    title: "Built for mobile",
    desc: "A layout made for the phone in your hand, not a shrunk desktop table.",
    Icon: Smartphone,
  },
];

export function Features() {
  return (
    <Section id="features">
      <Reveal className="max-w-2xl">
        <SectionLabel index="01">features</SectionLabel>
        <SectionHeading>Everything you need to track money. Nothing that watches you.</SectionHeading>
        <p className="mt-4 font-sans text-muted-foreground leading-relaxed">
          No bank connections, no Plaid, no scraping. You enter what you spend,
          and it stays yours.
        </p>
      </Reveal>

      <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 border-l border-t border-border">
        {FEATURES.map(({ key, title, desc, Icon }, i) => (
          <Reveal
            key={key}
            delay={i * 0.05}
            className="group border-r border-b border-border p-6 md:p-8 transition-colors hover:bg-primary/[0.03]"
          >
            <div className="flex items-center justify-between">
              <Icon className="h-5 w-5 text-primary" />
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground group-hover:text-primary transition-colors">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-6 text-base font-semibold">{title}</h3>
            <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
              {desc}
            </p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
