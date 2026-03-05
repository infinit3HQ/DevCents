import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Calculator, Upload, CreditCard, Settings } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => {
              // Trigger Add Transaction (We can dispatch an event or focus the AddTransaction input)
              document.dispatchEvent(new CustomEvent('open-add-transaction'));
          })}>
            <Calculator className="mr-2 h-4 w-4" />
            <span>Add Transaction</span>
            <CommandShortcut>⌘ T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => {
              document.dispatchEvent(new CustomEvent('open-csv-import'));
          })}>
            <Upload className="mr-2 h-4 w-4" />
            <span>Import CSV</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => navigate({ to: '/' }))}>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: '/' }))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘ S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
