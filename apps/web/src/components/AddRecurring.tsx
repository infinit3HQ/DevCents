import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cloneElement, isValidElement, type ReactNode } from "react";

export function AddRecurring({ trigger }: { trigger?: ReactNode }) {
  const open = () => {
    document.dispatchEvent(
      new CustomEvent("open-add-entry", { detail: { mode: "recurring" } }),
    );
  };

  if (trigger && isValidElement<{ onClick?: (e: unknown) => void }>(trigger)) {
    return cloneElement(trigger, {
      onClick: (e: unknown) => {
        trigger.props?.onClick?.(e);
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
      <Repeat className="mr-1.5 h-3.5 w-3.5" />
      recur
    </Button>
  );
}
