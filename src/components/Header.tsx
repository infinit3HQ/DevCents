import { Link } from "@tanstack/react-router";
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

function EncryptionBadge() {
  const { isEnabled, isUnlocked, setupEncryption } = useEncryption();

  if (!isEnabled) {
    return (
      <button
        onClick={setupEncryption}
        className="hidden md:flex items-center gap-1.5 px-2.5 h-7 mr-2 transition-all"
        style={{
          border: "1px solid hsl(0 0% 18%)",
          background: "transparent",
          color: "hsl(0 0% 38%)",
        }}
        title="Click to enable AES-256-GCM encryption"
      >
        <ShieldOff className="h-3 w-3" />
        <span className="font-mono text-[9px] uppercase tracking-widest">
          enc::off
        </span>
      </button>
    );
  }

  if (isEnabled && !isUnlocked) {
    return (
      <div
        className="hidden md:flex items-center gap-1.5 px-2.5 h-7"
        style={{
          border: "1px solid hsl(40 80% 50% / 0.25)",
          background: "hsl(40 80% 50% / 0.06)",
          color: "hsl(40 75% 55%)",
        }}
        title="Encryption enabled but locked"
      >
        <ShieldAlert className="h-3 w-3" />
        <span className="font-mono text-[9px] uppercase tracking-widest">
          enc::locked
        </span>
      </div>
    );
  }

  // Enabled + unlocked
  return (
    <div
      className="hidden md:flex items-center gap-1.5 px-2.5 h-7"
      style={{
        border: "1px solid hsl(142 60% 52% / 0.2)",
        background: "hsl(142 60% 52% / 0.06)",
        color: "hsl(142 55% 52%)",
      }}
      title="AES-256-GCM client-side encryption active"
    >
      <ShieldCheck className="h-3 w-3" />
      <span className="font-mono text-[9px] uppercase tracking-widest">
        enc::aes-256
      </span>
    </div>
  );
}

export default function Header() {
  return (
    <motion.header
      initial={{ y: -4, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 z-50 w-full h-12 flex items-center justify-between px-4 sm:px-6
                 bg-background/95 backdrop-blur"
      style={{ borderBottom: "1px solid hsl(0 0% 11%)" }}
    >
      {/* ── Brand ──────────────────────────────────────────────────── */}
      <Link to="/" className="flex items-center gap-2 group shrink-0">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="font-mono text-sm font-medium tracking-tight text-foreground group-hover:text-primary transition-colors duration-150">
          cent<span className="text-primary">stack</span>
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
          <Link
            to="/settings"
            className="hidden sm:flex h-7 w-7 items-center justify-center transition-colors"
            style={{
              border: "1px solid hsl(0 0% 16%)",
              color: "hsl(0 0% 38%)",
            }}
            activeProps={{
              style: {
                borderColor: "hsl(142 60% 52% / 0.4)",
                color: "hsl(142 55% 52%)",
              },
            }}
            title="Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>

          <div className="h-7 w-7 flex items-center justify-center">
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </nav>
    </motion.header>
  );
}
