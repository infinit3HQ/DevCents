import { useState } from "react";
import { SignUpButton, SignInButton } from "@clerk/tanstack-react-start";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPreview } from "./DashboardPreview";

const SELF_HOST_CMD = "docker compose up -d";
const COPY_RESET_MS = 1600;

function CopyCommand() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SELF_HOST_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="group inline-flex items-center gap-3 border border-border bg-card/60 px-3 h-9 font-mono text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
      aria-label={`Copy command: ${SELF_HOST_CMD}`}
    >
      <span className="text-primary">$</span>
      <span>{SELF_HOST_CMD}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-primary" />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100" />
      )}
    </button>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 dot-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_75%)]" />
      <div className="absolute -top-40 right-0 -z-10 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-[120px]" />

      <div className="mx-auto max-w-6xl px-4 md:px-8 pt-16 pb-20 md:pt-24 md:pb-28 grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="inline-flex items-center gap-2 border border-border px-2.5 h-7 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="status-dot" />
            open source · self-hosted · AGPL-3.0
          </p>

          <h1 className="mt-7 text-4xl sm:text-5xl lg:text-[3.6rem] font-semibold leading-[1.05] tracking-tight text-balance">
            Your money,
            <br />
            on <span className="text-primary text-glow-sm">your server</span>
            <span className="ml-1 inline-block w-[0.5ch] h-[0.9em] translate-y-[0.1em] bg-primary animate-pulse" />
          </h1>

          <p className="mt-6 max-w-lg font-sans text-base md:text-lg leading-relaxed text-muted-foreground">
            A personal finance tracker you run yourself. Amounts and notes are
            encrypted in your browser before they reach the database, so the
            server only ever stores ciphertext.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <SignUpButton mode="modal">
              <Button size="lg" className="h-11 rounded-none px-6 font-mono uppercase tracking-widest text-xs group">
                Get started
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-none px-6 font-mono uppercase tracking-widest text-xs bg-transparent hover:bg-primary/5 hover:text-primary hover:border-primary/40"
              >
                Sign in
              </Button>
            </SignInButton>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CopyCommand />
            <span className="font-mono text-[11px] text-muted-foreground">
              one compose file to self-host
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
        >
          <DashboardPreview />
        </motion.div>
      </div>
    </section>
  );
}
