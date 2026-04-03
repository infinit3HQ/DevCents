import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { SignedIn, UserButton } from "@clerk/tanstack-react-start";
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
import { CSVImport } from "./CSVImport";
import { AddTransaction } from "./AddTransaction";
import { useEncryption } from "@/contexts/EncryptionContext";
import { Tip } from "@/components/ui/Tip";

function EncryptionBadge() {
  const { isEnabled, isUnlocked, setupEncryption } = useEncryption();

  if (!isEnabled) {
    return (
      <Tip label="Click to enable AES-256-GCM encryption" side="bottom">
        <button
          onClick={setupEncryption}
          className="hidden md:flex items-center gap-1.5 px-2.5 h-7 transition-all border border-border bg-transparent text-muted-foreground"
        >
          <ShieldOff className="h-3 w-3" />
          <span className="font-mono text-[9px] uppercase tracking-widest">
            enc::off
          </span>
        </button>
      </Tip>
    );
  }

  if (isEnabled && !isUnlocked) {
    return (
      <Tip label="Encryption enabled but locked" side="bottom">
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 h-7 border border-amber-500/25 bg-amber-500/5 text-amber-500"
        >
          <ShieldAlert className="h-3 w-3" />
          <span className="font-mono text-[9px] uppercase tracking-widest">
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
        className="hidden md:flex items-center gap-1.5 px-2.5 h-7 border border-primary/20 bg-primary/5 text-primary"
      >
        <ShieldCheck className="h-3 w-3" />
        <span className="font-mono text-[9px] uppercase tracking-widest">
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
        <SignedIn>
          <EncryptionBadge />

          {/* Import */}
          <CSVImport
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:flex h-7 px-3 rounded-none font-mono text-[10px] uppercase tracking-widest
                         text-muted-foreground border border-border hover:border-primary/40
                         hover:text-primary hover:bg-primary/5 transition-all duration-150"
              >
                <Upload className="mr-1.5 h-3 w-3" />
                import
              </Button>
            }
          />

          {/* Add */}
          <AddTransaction
            trigger={
              <Button
                size="sm"
                className="h-7 px-3 rounded-none font-mono text-[10px] uppercase tracking-widest
                         bg-primary text-primary-foreground border border-primary
                         hover:bg-primary/85 hover:shadow-[0_0_12px_hsl(142_60%_52%/0.25)]
                         transition-all duration-150 hidden sm:flex"
              >
                <Plus className="mr-1.5 h-3 w-3" />
                new
              </Button>
            }
          />

          {/* Settings */}
          <button
            onClick={toggleSettings}
            className={`hidden sm:flex h-7 w-7 items-center justify-center transition-colors border border-border text-muted-foreground ${isSettings ? "border-primary/40 text-primary" : ""}`}
            title={isSettings ? "Close settings" : "Settings"}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <div className="h-7 w-7 flex items-center justify-center">
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </nav>
    </motion.header>
  );
}
