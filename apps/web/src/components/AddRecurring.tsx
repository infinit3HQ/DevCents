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
    >
      <Repeat />
      recur
    </Button>
  );
}
