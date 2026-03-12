import { Home, ReceiptText, BarChart3, Plus } from "lucide-react";
import { AddTransaction } from "./AddTransaction";
import { motion } from "framer-motion";
import { UserButton } from "@clerk/tanstack-react-start";
import { cn } from "@/lib/utils";

type MobileTab = "overview" | "transactions" | "analytics";

interface MobileNavProps {
  activeTab?: MobileTab;
  onTabChange?: (tab: MobileTab) => void;
}

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  const leftTabs = [
    { id: "overview" as MobileTab, label: "home", icon: Home },
    { id: "transactions" as MobileTab, label: "ledger", icon: ReceiptText },
  ];
  const rightTabs = [
    { id: "analytics" as MobileTab, label: "charts", icon: BarChart3 },
  ];

  const tabBtn = (tab: {
    id: MobileTab;
    label: string;
    icon: React.ElementType;
  }) => {
    const Icon = tab.icon;
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange?.(tab.id)}
        className={cn(
          "flex flex-col items-center gap-1 flex-1 py-2 transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <motion.div whileTap={{ scale: 0.85 }}>
          <Icon className="h-[18px] w-[18px]" />
        </motion.div>
        <span className="text-[8px] font-mono uppercase tracking-widest">
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <motion.div
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center h-14">
        {/* Left tabs */}
        <div className="flex flex-1 items-center">{leftTabs.map(tabBtn)}</div>

        {/* Center FAB */}
        <div className="flex items-center justify-center px-2">
          <AddTransaction
            trigger={
              <motion.button
                whileTap={{ scale: 0.9 }}
                className="w-11 h-11 flex items-center justify-center font-mono bg-primary text-primary-foreground shadow-[0_0_16px_color-mix(in oklch, var(--color-primary), transparent 96%)]"
                aria-label="Add transaction"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </motion.button>
            }
          />
        </div>

        {/* Right tabs + user */}
        <div className="flex flex-1 items-center">
          {rightTabs.map(tabBtn)}
          <div className="flex flex-col items-center gap-1 flex-1 py-2 text-muted-foreground">
            <div className="h-[18px] w-[18px] flex items-center justify-center">
              <UserButton afterSignOutUrl="/" />
            </div>
            <span className="text-[8px] font-mono uppercase tracking-widest">
              account
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
