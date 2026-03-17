import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ALL_CURRENCIES } from "@/lib/currencyUtils";

interface CurrencyComboboxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Compact mode — shows only the currency code, used inside form inputs */
  compact?: boolean;
}

export function CurrencyCombobox({
  value,
  onChange,
  className,
  compact = false,
}: CurrencyComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selected = ALL_CURRENCIES.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label="Select currency"
            className={cn(
              "h-12 w-[72px] rounded-none bg-transparent uppercase text-[10px] font-mono tracking-widest px-2 border border-border text-foreground/70 flex items-center justify-between focus:outline-none",
              className,
            )}
          >
            <span>{selected?.code ?? value}</span>
            <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "justify-between rounded-none font-mono text-[10px] uppercase tracking-widest border-border bg-transparent",
              className,
            )}
          >
            {selected ? `${selected.code} (${selected.symbol})` : "Select…"}
            <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50 shrink-0" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0 rounded-none border-border"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search currency…"
            className="font-mono text-[11px] h-9"
          />
          <CommandList>
            <CommandEmpty className="font-mono text-[10px] py-4 text-center text-muted-foreground">
              No currency found.
            </CommandEmpty>
            <CommandGroup>
              {ALL_CURRENCIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.label}`}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className="font-mono text-[11px] uppercase tracking-wide cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3 w-3",
                      value === c.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="text-foreground/90">{c.code}</span>
                  <span className="ml-2 text-muted-foreground normal-case tracking-normal">
                    {c.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
