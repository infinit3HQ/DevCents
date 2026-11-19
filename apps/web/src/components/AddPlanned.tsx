import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cloneElement, isValidElement, type ReactNode } from "react";

export function AddPlanned({ trigger }: { trigger?: ReactNode }) {
  const open = () => {
    document.dispatchEvent(
      new CustomEvent("open-add-entry", { detail: { mode: "planned" } }),
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
      <CalendarPlus />
      plan
    </Button>
  );
}
