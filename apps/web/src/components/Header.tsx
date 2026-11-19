import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Show, UserButton } from "@clerk/tanstack-react-start";
import { motion } from "framer-motion";
import {
  Upload,
  Plus,
  Terminal,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Settings,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { CSVImport } from "./CSVImport";
import { AddTransaction } from "./AddTransaction";
import { useEncryption } from "@/contexts/EncryptionContext";
import { Tip } from "@/components/ui/Tip";

function EncryptionBadge() {
  const { isEnabled, isUnlocked, setupEncryption } = useEncryption();

  if (!isEnabled) {
    return (
      <Tip label="Click to enable AES-256-GCM encryption" side="bottom">
        <Button
          variant="outline"
          size="sm"
          onClick={setupEncryption}
          className="hidden md:inline-flex text-muted-foreground"
        >
          <ShieldOff />
          enc::off
        </Button>
      </Tip>
    );
  }

  if (isEnabled && !isUnlocked) {
    return (
      <Tip label="Encryption enabled but locked" side="bottom">
        <div
          className="hidden md:flex items-center gap-1.5 px-3 h-8 border border-amber-500/25 bg-amber-500/5 text-amber-500"
        >
          <ShieldAlert className="h-3 w-3" />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            enc::locked
          </span>
        </div>
      </Tip>
    );
  }

  // Enabled + unlocked
  return (
    <Tip label="AES-256-GCM client-side encryption active" side="bottom">
      <div
        className="hidden md:flex items-center gap-1.5 px-3 h-8 border border-primary/20 bg-primary/5 text-primary"
      >
        <ShieldCheck className="h-3 w-3" />
        <span className="font-mono text-[10px] uppercase tracking-widest">
          enc::aes-256
        </span>
      </div>
    </Tip>
  );
}

export default function Header() {
  const location = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isSettings = location === "/settings";

  function toggleSettings() {
    if (isSettings) {
      navigate({ to: "/" });
    } else {
      navigate({ to: "/settings" });
    }
  }

  return (
    <motion.header
      initial={{ y: -4, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="shrink-0 w-full h-12 flex items-center justify-between px-4 sm:px-6
                 bg-background/95 backdrop-blur border-b border-border z-50"
    >
      {/* ── Brand ──────────────────────────────────────────────────── */}
      <Link to="/" className="flex items-center gap-2 group shrink-0">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="font-mono text-sm font-medium tracking-tight text-foreground group-hover:text-primary transition-colors duration-150">
          dev<span className="text-primary">cents</span>
          <span className="text-muted-foreground ml-0.5">_</span>
        </span>
      </Link>

      {/* ── Right actions ──────────────────────────────────────────── */}
      <nav className="flex items-center gap-2">
        <Show when="signed-in">
          <EncryptionBadge />

          {/* Import */}
          <CSVImport
            trigger={
              <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                <Upload />
                import
              </Button>
            }
          />

          {/* Add */}
          <AddTransaction
            trigger={
              <Button size="sm" className="hidden sm:inline-flex">
                <Plus />
                new
              </Button>
            }
          />

          {/* Settings */}
          <Button
            variant="outline"
            size="icon-compact"
            onClick={toggleSettings}
            aria-label={isSettings ? "Close settings" : "Settings"}
            aria-pressed={isSettings}
            className={cn("hidden sm:inline-flex", isSettings ? "border-primary/40 text-primary" : "text-muted-foreground")}
          >
            <Settings />
          </Button>

          <div className="h-8 w-8 flex items-center justify-center">
            <UserButton />
          </div>
        </Show>
      </nav>
    </motion.header>
  );
}
