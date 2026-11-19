import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const REPO_URL = "https://github.com/infinit3HQ/DevCents";
export const SELF_HOST_URL = `${REPO_URL}/blob/main/docs/self-hosting.md`;

/** Fades content up once when it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** `// 02 — ENCRYPTION` style eyebrow used above section headings. */
export function SectionLabel({
  index,
  children,
}: {
  index: string;
  children: ReactNode;
}) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
      <span className="text-primary">{index}</span>
      <span className="mx-2 text-border">/</span>
      {children}
    </p>
  );
}

export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-balance",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Full-bleed section with hairline top border and centered content column. */
export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("border-t border-border", className)}>
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-20 md:py-28">
        {children}
      </div>
    </section>
  );
}
