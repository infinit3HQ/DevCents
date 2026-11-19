import { Eye, Server } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal, Section, SectionHeading, SectionLabel } from "./primitives";

type Row = { field: string; plain: string; cipher: string };

const ROWS: readonly Row[] = [
  { field: "description", plain: '"Rent - November"', cipher: '"v1:8fK2q0Zr…Xw9="' },
  { field: "amount", plain: "-1,650.00", cipher: '"v1:Qm4tA1pL…c7E="' },
  { field: "category", plain: '"housing"', cipher: '"housing"' },
  { field: "date", plain: '"2026-11-01"', cipher: '"2026-11-01"' },
];

function Panel({
  title,
  Icon,
  pick,
  highlight,
}: {
  title: string;
  Icon: LucideIcon;
  pick: (row: Row) => string;
  highlight: string;
}) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 h-9 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6">
        <code>
          {"{\n"}
          {ROWS.map((row) => {
            const value = pick(row);
            const changed = row.plain !== row.cipher;
            return (
              <span key={row.field}>
                {"  "}
                <span className="text-muted-foreground">{row.field}</span>
                {": "}
                <span className={changed ? highlight : ""}>{value}</span>
                {",\n"}
              </span>
            );
          })}
          {"}"}
        </code>
      </pre>
    </div>
  );
}

export function EncryptionDemo() {
  return (
    <Section id="security" className="bg-card/30">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-center">
        <Reveal>
          <SectionLabel index="02">encryption</SectionLabel>
          <SectionHeading>The server can’t read your numbers.</SectionHeading>
          <p className="mt-4 font-sans text-muted-foreground leading-relaxed">
            Amounts and descriptions are encrypted with AES-256-GCM in your
            browser, using a key derived from a passphrase only you know. The
            database stores ciphertext. Lose the passphrase and nobody, including
            whoever runs the server, can recover it.
          </p>
          <ul className="mt-8 space-y-3 font-mono text-xs">
            {[
              "AES-256-GCM, keyed by your passphrase",
              "Key stays in the browser",
              "Unlock with WebAuthn biometrics",
              "No analytics, no bank access",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="text-primary">→</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="grid gap-4">
          <Panel title="what you see" Icon={Eye} pick={(r) => r.plain} highlight="text-primary" />
          <Panel title="what the server stores" Icon={Server} pick={(r) => r.cipher} highlight="text-amber-400/90" />
        </Reveal>
      </div>
    </Section>
  );
}
