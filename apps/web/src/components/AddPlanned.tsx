import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cloneElement, isValidElement, type ReactNode } from "react";

export function AddPlanned({ trigger }: { trigger?: ReactNode }) {
  const open = () => {
    document.dispatchEvent(
      new CustomEvent("open-add-entry", { detail: { mode: "planned" } }),
    );
  };

  if (trigger && isValidElement(trigger)) {
    return cloneElement(trigger, {
      // Preserve any existing click handler on the trigger.
      onClick: (e: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (trigger.props as any)?.onClick?.(e);
        open();
      },
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={open}
      className="h-8 rounded-none font-mono text-[10px] uppercase tracking-widest border border-border text-muted-foreground bg-transparent hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
    >
      <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
      plan
    </Button>
  );
}
