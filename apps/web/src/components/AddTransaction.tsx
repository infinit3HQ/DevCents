import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarPlus, Plus, ReceiptText, Repeat } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  suggestCategory,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
} from "@/lib/categoryUtils";
import { useEncryption } from "@/contexts/EncryptionContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencyUtils";
import { CurrencyCombobox } from "@/components/ui/CurrencyCombobox";
import { AmountInput } from "@/components/ui/AmountInput";
import { parseLocalDateInputToNoonMs } from "@/lib/planningUtils";
import { DatePickerField } from "@/components/ui/date-picker-field";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EntryMode = "ledger" | "planned" | "recurring";

export type EditData = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  type: "income" | "expense";
  // planned
  date?: string;
  // recurring
  startDate?: string;
  cadence?: "weekly" | "biweekly" | "monthly" | "yearly";
};

const ledgerSchema = z.object({
  amount: z
    .union([z.number(), z.string()])
    .transform((val) => Number(val) || 0)
    .refine((val) => val > 0.01, { message: "Amount must be greater than 0" }),
  currency: z.string(),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  type: z.enum(["income", "expense"]),
});

const plannedSchema = ledgerSchema.extend({
  date: z.string().min(10, "Date is required"),
});

const recurringSchema = ledgerSchema.extend({
  startDate: z.string().min(10, "Start date is required"),
  cadence: z.enum(["weekly", "biweekly", "monthly", "yearly"]),
});

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useEntryFormUX(form: UseFormReturn<any>, open: boolean, baseCurrency: string) {
  const description = form.watch("description") as string;
  const type = form.watch("type") as "income" | "expense";

  const activeCategories =
    type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  useEffect(() => {
    if (description && description.length > 2) {
      const suggested = suggestCategory(description);
      if (suggested !== "other")
        form.setValue("category", suggested);
    }
  }, [description, form]);

  useEffect(() => {
    if (open) form.setValue("currency", baseCurrency);
  }, [open, baseCurrency, form]);

  useEffect(() => {
    const currentCategory = form.getValues("category");
    if (!activeCategories.find((c) => c.value === currentCategory)) {
      form.setValue("category", activeCategories[0].value);
    }
  }, [type, activeCategories, form]);

  return { type, activeCategories };
}

const ENTRY_MODES: Array<{
  id: EntryMode;
  label: string;
  icon: ElementType;
  title: string;
  description: string;
}> = [
  {
    id: "ledger",
    label: "ledger",
    icon: ReceiptText,
    title: "new_entry::",
    description: "append_record_to_ledger",
  },
  {
    id: "planned",
    label: "planned",
    icon: CalendarPlus,
    title: "new_plan::",
    description: "schedule_one_time_cashflow",
  },
  {
    id: "recurring",
    label: "recurring",
    icon: Repeat,
    title: "new_recur::",
    description: "configure_repeatable_cashflow",
  },
];

// Module-level flag to prevent multiple instances from opening
let isAnyInstanceOpen = false;

export function AddTransaction({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EntryMode>("ledger");
  const [editData, setEditData] = useState<EditData | null>(null);
  const [savingMode, setSavingMode] = useState<EntryMode | null>(null);
  const [submitError, setSubmitError] = useState<{
    mode: EntryMode;
    message: string;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closedAtRef = useRef(0);
  const createTransaction = useMutation(api.transactions.create);
  const updateTransactionMut = useMutation(api.transactions.update);
  const createPlanned = useMutation(api.planned.create);
  const updatePlannedMut = useMutation(api.planned.update);
  const createRecurring = useMutation(api.recurring.create);
  const updateRecurringMut = useMutation(api.recurring.update);
  const { isEnabled, isUnlocked, encryptValue } = useEncryption();
  const { baseCurrency } = useCurrency();

  const isEditing = editData !== null;

  useEffect(() => {
    isAnyInstanceOpen = open;
  }, [open]);

  useEffect(() => {
    const handleOpenAddEntry = (evt: Event) => {
      if (Date.now() - closedAtRef.current < 400) return;
      if (isAnyInstanceOpen) return;
      isAnyInstanceOpen = true;
      const e = evt as CustomEvent<{ mode?: EntryMode; editData?: EditData }>;
      if (e.detail?.mode) setMode(e.detail.mode);
      setEditData(e.detail?.editData ?? null);
      setOpen(true);
    };

    document.addEventListener("open-add-transaction", handleOpenAddEntry);
    document.addEventListener("open-add-entry", handleOpenAddEntry);

    return () =>
      ["open-add-transaction", "open-add-entry"].forEach((name) =>
        document.removeEventListener(name, handleOpenAddEntry),
      );
  }, []);

  const txForm = useForm({
    resolver: zodResolver(ledgerSchema),
    defaultValues: {
      amount: "" as unknown as number,
      currency: baseCurrency || "USD",
      description: "",
      category: "food",
      type: "expense" as const,
    },
  });

  const plannedForm = useForm({
    resolver: zodResolver(plannedSchema),
    defaultValues: {
      amount: "" as unknown as number,
      currency: baseCurrency || "USD",
      description: "",
      category: "rent",
      type: "expense" as const,
      date: todayInputValue(),
    },
  });

  const recurringForm = useForm({
    resolver: zodResolver(recurringSchema),
    defaultValues: {
      amount: "" as unknown as number,
      currency: baseCurrency || "USD",
      description: "",
      category: "utilities",
      type: "expense" as const,
      startDate: todayInputValue(),
      cadence: "monthly" as const,
    },
  });

  const { activeCategories: txCategories } = useEntryFormUX(
    txForm,
    open,
    baseCurrency,
  );
  const { activeCategories: plannedCategories } = useEntryFormUX(
    plannedForm,
    open,
    baseCurrency,
  );
  const { activeCategories: recurringCategories } = useEntryFormUX(
    recurringForm,
    open,
    baseCurrency,
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "planned") plannedForm.setValue("date", todayInputValue());
    if (mode === "recurring")
      recurringForm.setValue("startDate", todayInputValue());
  }, [open, mode, plannedForm, recurringForm]);

  // Pre-fill forms when editing
  useEffect(() => {
    if (!open || !editData) return;
    const { amount, currency, description, category, type } = editData;
    if (mode === "ledger") {
      txForm.reset({ amount, currency, description, category, type });
    } else if (mode === "planned") {
      plannedForm.reset({ amount, currency, description, category, type, date: editData.date ?? todayInputValue() });
    } else if (mode === "recurring") {
      recurringForm.reset({ amount, currency, description, category, type, startDate: editData.startDate ?? todayInputValue(), cadence: editData.cadence ?? "monthly" });
    }
  }, [open, editData, mode, txForm, plannedForm, recurringForm]);

  useEffect(() => {
    if (!open) return;
    // Clear any previous failure when reopening or switching mode.
    setSubmitError(null);
  }, [open, mode]);

  const formatSubmitError = (err: unknown): string => {
    if (err instanceof Error) {
      if (
        /clerk/i.test(err.message) ||
        /\/tokens/i.test(err.message) ||
        /sess_/i.test(err.message)
      ) {
        return "Authentication error. Check your Clerk JWT template configuration.";
      }
      if (/network|fetch|failed to fetch/i.test(err.message)) {
        return "Network error. Please check your connection and try again.";
      }
    }
    return "Something went wrong. Please try again.";
  };

  const focusFirstField = () => {
    const root = contentRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>('[data-entry-autofocus="true"]');
    el?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Let the drawer content/mode swap render before focusing.
    const t = window.setTimeout(focusFirstField, 0);
    return () => window.clearTimeout(t);
  }, [open, mode]);

  const header = useMemo(() => {
    const base = ENTRY_MODES.find((m) => m.id === mode) ?? ENTRY_MODES[0];
    if (!isEditing) return base;
    return { ...base, title: `edit_${base.id}::`, description: `modify_existing_${base.id}_record` };
  }, [mode, isEditing]);

  async function submitLedger(values: z.infer<typeof ledgerSchema>) {
    setSavingMode("ledger");
    setSubmitError(null);
    try {
      const shouldEncrypt = isEnabled && isUnlocked;
      const amount = shouldEncrypt ? await encryptValue(String(values.amount)) : values.amount;
      const description = shouldEncrypt ? await encryptValue(values.description) : values.description;

      if (isEditing) {
        await updateTransactionMut({
          id: editData.id as any,
          amount,
          currency: values.currency,
          description,
          category: values.category,
          encrypted: shouldEncrypt || undefined,
        });
      } else {
        await createTransaction({
          amount,
          currency: values.currency,
          description,
          type: values.type,
          category: values.category,
          date: Date.now(),
          encrypted: shouldEncrypt || undefined,
        });
      }
      setOpen(false);
      txForm.reset();
      setEditData(null);
    } catch (err) {
      setSubmitError({ mode: "ledger", message: formatSubmitError(err) });
    } finally {
      setSavingMode(null);
    }
  }

  async function submitPlanned(values: z.infer<typeof plannedSchema>) {
    setSavingMode("planned");
    setSubmitError(null);
    try {
      const shouldEncrypt = isEnabled && isUnlocked;
      const amount = shouldEncrypt ? await encryptValue(String(values.amount)) : values.amount;
      const description = shouldEncrypt ? await encryptValue(values.description) : values.description;

      if (isEditing) {
        await updatePlannedMut({
          id: editData.id as any,
          amount,
          currency: values.currency,
          description,
          category: values.category,
          date: parseLocalDateInputToNoonMs(values.date),
          encrypted: shouldEncrypt || undefined,
        });
      } else {
        await createPlanned({
          amount,
          currency: values.currency,
          description,
          type: values.type,
          category: values.category,
          date: parseLocalDateInputToNoonMs(values.date),
          encrypted: shouldEncrypt || undefined,
        });
      }
      setOpen(false);
      plannedForm.reset();
      setEditData(null);
    } catch (err) {
      setSubmitError({ mode: "planned", message: formatSubmitError(err) });
    } finally {
      setSavingMode(null);
    }
  }

  async function submitRecurring(values: z.infer<typeof recurringSchema>) {
    setSavingMode("recurring");
    setSubmitError(null);
    try {
      const shouldEncrypt = isEnabled && isUnlocked;
      const amount = shouldEncrypt ? await encryptValue(String(values.amount)) : values.amount;
      const description = shouldEncrypt ? await encryptValue(values.description) : values.description;

      if (isEditing) {
        await updateRecurringMut({
          id: editData.id as any,
          amount,
          currency: values.currency,
          description,
          category: values.category,
          startDate: parseLocalDateInputToNoonMs(values.startDate),
          cadence: values.cadence,
          encrypted: shouldEncrypt || undefined,
        });
      } else {
        await createRecurring({
          amount,
          currency: values.currency,
          description,
          type: values.type,
          category: values.category,
          startDate: parseLocalDateInputToNoonMs(values.startDate),
          cadence: values.cadence,
          encrypted: shouldEncrypt || undefined,
        });
      }
      setOpen(false);
      recurringForm.reset();
      setEditData(null);
    } catch (err) {
      setSubmitError({ mode: "recurring", message: formatSubmitError(err) });
    } finally {
      setSavingMode(null);
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) { closedAtRef.current = Date.now(); setEditData(null); } setOpen(v); }}>
      <DrawerTrigger asChild>
        {trigger || (
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="fixed bottom-8 right-8 z-50 hidden md:block"
          >
            <Button
              size="icon"
              className="h-14 w-14 rounded-full border border-primary/30 transition-all duration-300 shadow-[0_0_30px_color-mix(in oklch, var(--color-primary), transparent 85%)] hover:shadow-[0_0_40px_color-mix(in oklch, var(--color-primary), transparent 75%)] bg-primary/10 text-primary"
            >
              <Plus className="h-6 w-6" />
              <span className="sr-only">New Record</span>
            </Button>
          </motion.div>
        )}
      </DrawerTrigger>

      {/* Mobile Trigger Alternative */}
      {!trigger && (
        <DrawerTrigger asChild>
          <motion.div whileTap={{ scale: 0.95 }} className="md:hidden">
            <Button
              size="icon"
              className="h-12 w-12 -mt-6 rounded-full border border-primary/30 shadow-[0_0_20px_color-mix(in oklch, var(--color-primary), transparent 85%)] transition-all bg-primary/10 text-primary"
            >
              <Plus className="h-5 w-5" />
              <span className="sr-only">New Record</span>
            </Button>
          </motion.div>
        </DrawerTrigger>
      )}

      <DrawerContent
        ref={contentRef}
        onOpenAutoFocus={(e) => {
          // Vaul/Radix will try to keep focus on the trigger if we don't guide it.
          // That creates an `aria-hidden` warning because the trigger is hidden when the drawer opens.
          e.preventDefault();
          focusFirstField();
        }}
        className="rounded-t-[20px] border-t border-border bg-card max-h-[94vh] overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-full max-w-lg mb-8"
        >
          <DrawerHeader className="border-b border-border pb-6 mt-4">
            <DrawerTitle className="font-mono text-lg tracking-[0.2em] text-center text-foreground uppercase">
              {header.title}
            </DrawerTitle>
            <DrawerDescription className="font-mono text-[9px] uppercase tracking-widest text-center mt-2 text-muted-foreground">
              {header.description}
            </DrawerDescription>
          </DrawerHeader>

          <div className="p-6 md:p-8">
            {/* Mode switch */}
            <div className="mb-6 flex items-center border border-border bg-background/40">
              {ENTRY_MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                const disabled = isEditing && mode !== m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => !disabled && setMode(m.id)}
                    disabled={disabled}
                    className={[
                      "flex-1 h-10 px-3 border-r last:border-r-0 border-border",
                      "font-mono text-[10px] uppercase tracking-widest transition-colors",
                      "flex items-center justify-center gap-2",
                      active
                        ? "bg-primary/10 text-primary"
                        : disabled
                          ? "text-muted-foreground/30 cursor-not-allowed"
                          : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                    ].join(" ")}
                    type="button"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {mode === "ledger" && (
                <motion.div
                  key="ledger"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <Form {...txForm}>
                    <form
                      onSubmit={txForm.handleSubmit(submitLedger)}
                      className="space-y-6"
                    >
                      <div className="grid grid-cols-2 gap-6">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 }}
                        >
                          <FormField
                            control={txForm.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Type
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest border border-border text-foreground/70">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70">
                                    <SelectItem value="expense">
                                      Expense
                                    </SelectItem>
                                    <SelectItem value="income">
                                      Income
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                        >
                          <FormField
                            control={txForm.control}
                            name="amount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Amount
                                </FormLabel>
                                <FormControl>
                                  <div className="relative flex items-center">
                                    <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center pointer-events-none w-[36px] border-r border-border text-muted-foreground">
                                      {getCurrencySymbol(
                                        txForm.watch("currency"),
                                      )}
                                    </div>
                                    <AmountInput
                                      placeholder="0.00"
                                      className="h-12 pl-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-base num-display border border-r-0 border-border text-foreground"
                                      data-entry-autofocus="true"
                                      value={field.value}
                                      onChange={(v) => field.onChange(v)}
                                    />
                                    <FormField
                                      control={txForm.control}
                                      name="currency"
                                      render={({ field: currencyField }) => (
                                        <CurrencyCombobox
                                          compact
                                          value={currencyField.value}
                                          onChange={currencyField.onChange}
                                        />
                                      )}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                      >
                        <FormField
                          control={txForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                Description
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="invoice, groceries, rent..."
                                  className="h-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-xs placeholder:text-[10px] placeholder:uppercase placeholder:tracking-widest border border-border text-foreground"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        <FormField
                          control={txForm.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                Category
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest border border-border text-foreground/70">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70">
                                  {txCategories.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="pt-4 grid grid-cols-[1fr_2fr] gap-4"
                      >
                        <DrawerClose asChild>
                          <Button
                            variant="outline"
                            type="button"
                            className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-colors hover:bg-white/5 border border-border text-muted-foreground bg-transparent"
                          >
                            Abort
                          </Button>
                        </DrawerClose>
                        <Button
                          type="submit"
                          disabled={savingMode === "ledger"}
                          className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-all bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                        >
                          {savingMode === "ledger"
                            ? "Submitting..."
                            : isEditing ? "Update Entry" : "Submit Entry"}
                        </Button>
                      </motion.div>
                      {submitError?.mode === "ledger" && (
                        <div
                          role="alert"
                          className="mt-3 border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive"
                        >
                          {submitError.message}
                        </div>
                      )}
                    </form>
                  </Form>
                </motion.div>
              )}

              {mode === "planned" && (
                <motion.div
                  key="planned"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <Form {...plannedForm}>
                    <form
                      onSubmit={plannedForm.handleSubmit(submitPlanned)}
                      className="space-y-6"
                    >
                      <div className="grid grid-cols-2 gap-6">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 }}
                        >
                          <FormField
                            control={plannedForm.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Type
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest border border-border text-foreground/70">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70">
                                    <SelectItem value="expense">
                                      Expense
                                    </SelectItem>
                                    <SelectItem value="income">
                                      Income
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                        >
                          <FormField
                            control={plannedForm.control}
                            name="date"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Date
                                </FormLabel>
                                <FormControl>
                                  <DatePickerField
                                    value={field.value}
                                    onChange={field.onChange}
                                    label="Planned date"
                                    className="rounded-none"
                                  />
                                </FormControl>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                      >
                        <FormField
                          control={plannedForm.control}
                          name="amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                Amount
                              </FormLabel>
                              <FormControl>
                                <div className="relative flex items-center">
                                  <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center pointer-events-none w-[36px] border-r border-border text-muted-foreground">
                                    {getCurrencySymbol(
                                      plannedForm.watch("currency"),
                                    )}
                                  </div>
                                  <AmountInput
                                    placeholder="0.00"
                                    className="h-12 pl-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-base num-display border border-r-0 border-border text-foreground"
                                    data-entry-autofocus="true"
                                    value={field.value}
                                    onChange={(v) => field.onChange(v)}
                                  />
                                  <FormField
                                    control={plannedForm.control}
                                    name="currency"
                                    render={({ field: currencyField }) => (
                                      <CurrencyCombobox
                                        compact
                                        value={currencyField.value}
                                        onChange={currencyField.onChange}
                                      />
                                    )}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        <FormField
                          control={plannedForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                Description
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="salary, rent, subscription..."
                                  className="h-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-xs placeholder:text-[10px] placeholder:uppercase placeholder:tracking-widest border border-border text-foreground"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                      >
                        <FormField
                          control={plannedForm.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                Category
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest border border-border text-foreground/70">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70">
                                  {plannedCategories.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="pt-4 grid grid-cols-[1fr_2fr] gap-4"
                      >
                        <DrawerClose asChild>
                          <Button
                            variant="outline"
                            type="button"
                            className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-colors hover:bg-white/5 border border-border text-muted-foreground bg-transparent"
                          >
                            Abort
                          </Button>
                        </DrawerClose>
                        <Button
                          type="submit"
                          disabled={savingMode === "planned"}
                          className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-all bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                        >
                          {savingMode === "planned"
                            ? "Scheduling..."
                            : isEditing ? "Update Plan" : "Schedule"}
                        </Button>
                      </motion.div>
                      {submitError?.mode === "planned" && (
                        <div
                          role="alert"
                          className="mt-3 border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive"
                        >
                          {submitError.message}
                        </div>
                      )}
                    </form>
                  </Form>
                </motion.div>
              )}

              {mode === "recurring" && (
                <motion.div
                  key="recurring"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <Form {...recurringForm}>
                    <form
                      onSubmit={recurringForm.handleSubmit(submitRecurring)}
                      className="space-y-6"
                    >
                      <div className="grid grid-cols-2 gap-6">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 }}
                        >
                          <FormField
                            control={recurringForm.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Type
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest border border-border text-foreground/70">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70">
                                    <SelectItem value="expense">
                                      Expense
                                    </SelectItem>
                                    <SelectItem value="income">
                                      Income
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                        >
                          <FormField
                            control={recurringForm.control}
                            name="cadence"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Cadence
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest border border-border text-foreground/70">
                                      <SelectValue placeholder="Select cadence" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70">
                                    <SelectItem value="weekly">
                                      Weekly
                                    </SelectItem>
                                    <SelectItem value="biweekly">
                                      Biweekly
                                    </SelectItem>
                                    <SelectItem value="monthly">
                                      Monthly
                                    </SelectItem>
                                    <SelectItem value="yearly">
                                      Yearly
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                        >
                          <FormField
                            control={recurringForm.control}
                            name="startDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Start
                                </FormLabel>
                                <FormControl>
                                  <DatePickerField
                                    value={field.value}
                                    onChange={field.onChange}
                                    label="Start date"
                                    className="rounded-none"
                                  />
                                </FormControl>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          <FormField
                            control={recurringForm.control}
                            name="amount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Amount
                                </FormLabel>
                                <FormControl>
                                  <div className="relative flex items-center">
                                    <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center pointer-events-none w-[36px] border-r border-border text-muted-foreground">
                                      {getCurrencySymbol(
                                        recurringForm.watch("currency"),
                                      )}
                                    </div>
                                    <AmountInput
                                      placeholder="0.00"
                                      className="h-12 pl-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-base num-display border border-r-0 border-border text-foreground"
                                      data-entry-autofocus="true"
                                      value={field.value}
                                      onChange={(v) => field.onChange(v)}
                                    />
                                    <FormField
                                      control={recurringForm.control}
                                      name="currency"
                                      render={({ field: currencyField }) => (
                                        <CurrencyCombobox
                                          compact
                                          value={currencyField.value}
                                          onChange={currencyField.onChange}
                                        />
                                      )}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </motion.div>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                      >
                        <FormField
                          control={recurringForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                Description
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="salary, rent, subscription..."
                                  className="h-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-xs placeholder:text-[10px] placeholder:uppercase placeholder:tracking-widest border border-border text-foreground"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <FormField
                          control={recurringForm.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                                Category
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest border border-border text-foreground/70">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70">
                                  {recurringCategories.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35 }}
                        className="pt-4 grid grid-cols-[1fr_2fr] gap-4"
                      >
                        <DrawerClose asChild>
                          <Button
                            variant="outline"
                            type="button"
                            className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-colors hover:bg-white/5 border border-border text-muted-foreground bg-transparent"
                          >
                            Abort
                          </Button>
                        </DrawerClose>
                        <Button
                          type="submit"
                          disabled={savingMode === "recurring"}
                          className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-all bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                        >
                          {savingMode === "recurring"
                            ? "Saving..."
                            : isEditing ? "Update Recurring" : "Save Recurring"}
                        </Button>
                      </motion.div>
                      {submitError?.mode === "recurring" && (
                        <div
                          role="alert"
                          className="mt-3 border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive"
                        >
                          {submitError.message}
                        </div>
                      )}
                    </form>
                  </Form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </DrawerContent>
    </Drawer>
  );
}
