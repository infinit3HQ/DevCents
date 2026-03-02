import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import {
  suggestCategory,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
} from "@/lib/categoryUtils";
import { useEncryption } from "@/contexts/EncryptionContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from "@/lib/currencyUtils";

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

const formSchema = z.object({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string(),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  type: z.enum(["income", "expense"]),
});

type TransactionFormValues = z.infer<typeof formSchema>;

export function AddTransaction({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createTransaction = useMutation(api.transactions.create);
  const { isEnabled, isUnlocked, encryptValue } = useEncryption();
  const { baseCurrency } = useCurrency();

  useEffect(() => {
    const handleOpenAddTransaction = () => setOpen(true);
    document.addEventListener("open-add-transaction", handleOpenAddTransaction);
    return () =>
      document.removeEventListener(
        "open-add-transaction",
        handleOpenAddTransaction,
      );
  }, []);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      currency: baseCurrency,
      description: "",
      category: "food",
      type: "expense",
    },
  });

  const description = form.watch("description");
  const type = form.watch("type");
  const activeCategories =
    type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  useEffect(() => {
    if (description && description.length > 2) {
      const suggested = suggestCategory(description);
      if (suggested !== "other") {
        form.setValue("category", suggested);
      }
    }
  }, [description, form]);

  useEffect(() => {
    if (open) {
      form.setValue("currency", baseCurrency);
    }
  }, [open, baseCurrency, form]);

  useEffect(() => {
    const currentCategory = form.getValues("category");
    if (!activeCategories.find((c) => c.value === currentCategory)) {
      form.setValue("category", activeCategories[0].value);
    }
  }, [type, activeCategories, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const shouldEncrypt = isEnabled && isUnlocked;

    await createTransaction({
      amount: shouldEncrypt
        ? await encryptValue(String(values.amount))
        : values.amount,
      currency: values.currency,
      description: shouldEncrypt
        ? await encryptValue(values.description)
        : values.description,
      type: values.type,
      category: values.category,
      date: Date.now(),
      encrypted: shouldEncrypt || undefined,
    });
    setOpen(false);
    form.reset();
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger || (
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="fixed bottom-8 right-8 z-50 hidden md:block"
          >
            <Button
              size="icon"
              className="h-14 w-14 rounded-full border border-primary/30 transition-all duration-300 shadow-[0_0_30px_hsl(142_60%_52%/0.15)] hover:shadow-[0_0_40px_hsl(142_60%_52%/0.25)]"
              style={{
                background: "hsl(142 60% 52% / 0.1)",
                color: "hsl(142 55% 55%)",
              }}
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
              className="h-12 w-12 -mt-6 rounded-full border border-primary/30 shadow-[0_0_20px_hsl(142_60%_52%/0.15)] transition-all"
              style={{
                background: "hsl(142 60% 52% / 0.1)",
                color: "hsl(142 55% 55%)",
              }}
            >
              <Plus className="h-5 w-5" />
              <span className="sr-only">New Record</span>
            </Button>
          </motion.div>
        </DrawerTrigger>
      )}

      <DrawerContent
        className="rounded-t-[20px] border-t border-white/10"
        style={{ background: "hsl(0 0% 6%)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-full max-w-lg mb-8"
        >
          <DrawerHeader
            className="border-b pb-6 mt-4"
            style={{ borderColor: "hsl(0 0% 12%)" }}
          >
            <DrawerTitle className="font-mono text-lg tracking-[0.2em] text-center text-foreground uppercase">
              new_entry::
            </DrawerTitle>
            <DrawerDescription
              className="font-mono text-[9px] uppercase tracking-widest text-center mt-2"
              style={{ color: "hsl(0 0% 40%)" }}
            >
              append_record_to_ledger
            </DrawerDescription>
          </DrawerHeader>

          <div className="p-6 md:p-8">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel
                            className="text-[9px] uppercase tracking-[0.2em]"
                            style={{ color: "hsl(0 0% 40%)" }}
                          >
                            Type
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger
                                className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest"
                                style={{
                                  border: "1px solid hsl(0 0% 14%)",
                                  color: "hsl(0 0% 70%)",
                                }}
                              >
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent
                              className="rounded-none font-mono text-[10px] uppercase tracking-widest"
                              style={{
                                border: "1px solid hsl(0 0% 14%)",
                                background: "hsl(0 0% 6%)",
                                color: "hsl(0 0% 70%)",
                              }}
                            >
                              <SelectItem value="expense">Expense</SelectItem>
                              <SelectItem value="income">Income</SelectItem>
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
                    transition={{ delay: 0.2 }}
                  >
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel
                            className="text-[9px] uppercase tracking-[0.2em]"
                            style={{ color: "hsl(0 0% 40%)" }}
                          >
                            Amount
                          </FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <div
                                className="absolute left-0 top-0 bottom-0 flex items-center justify-center pointer-events-none"
                                style={{
                                  width: "36px",
                                  borderRight: "1px solid hsl(0 0% 14%)",
                                  color: "hsl(0 0% 40%)",
                                }}
                              >
                                {getCurrencySymbol(form.watch("currency"))}
                              </div>
                              <Input
                                autoFocus
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                className="h-12 pl-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-base num-display border-r-0"
                                style={{
                                  border: "1px solid hsl(0 0% 14%)",
                                  borderRight: "none",
                                  color: "hsl(120 3% 88%)",
                                }}
                                {...field}
                              />
                              <FormField
                                control={form.control}
                                name="currency"
                                render={({ field: currencyField }) => (
                                  <Select
                                    onValueChange={currencyField.onChange}
                                    defaultValue={currencyField.value}
                                    value={currencyField.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger
                                        className="h-12 w-[72px] rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest px-2"
                                        style={{
                                          border: "1px solid hsl(0 0% 14%)",
                                          color: "hsl(0 0% 70%)",
                                        }}
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent
                                      className="rounded-none font-mono text-[10px] uppercase tracking-widest min-w-[72px]"
                                      style={{
                                        border: "1px solid hsl(0 0% 14%)",
                                        background: "hsl(0 0% 6%)",
                                        color: "hsl(0 0% 70%)",
                                      }}
                                    >
                                      {SUPPORTED_CURRENCIES.map((c) => (
                                        <SelectItem key={c.code} value={c.code}>
                                          {c.code}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
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
                  transition={{ delay: 0.3 }}
                >
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel
                          className="text-[9px] uppercase tracking-[0.2em]"
                          style={{ color: "hsl(0 0% 40%)" }}
                        >
                          Description
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="invoice, groceries, rent..."
                            className="h-12 rounded-none bg-transparent focus-visible:ring-0 font-mono text-xs placeholder:text-[10px] placeholder:uppercase placeholder:tracking-widest"
                            style={{
                              border: "1px solid hsl(0 0% 14%)",
                              color: "hsl(120 3% 88%)",
                            }}
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
                  transition={{ delay: 0.4 }}
                >
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel
                          className="text-[9px] uppercase tracking-[0.2em]"
                          style={{ color: "hsl(0 0% 40%)" }}
                        >
                          Category
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="h-12 rounded-none bg-transparent focus:ring-0 uppercase text-[10px] font-mono tracking-widest"
                              style={{
                                border: "1px solid hsl(0 0% 14%)",
                                color: "hsl(0 0% 70%)",
                              }}
                            >
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent
                            className="rounded-none font-mono text-[10px] uppercase tracking-widest"
                            style={{
                              border: "1px solid hsl(0 0% 14%)",
                              background: "hsl(0 0% 6%)",
                              color: "hsl(0 0% 70%)",
                            }}
                          >
                            {activeCategories.map((c) => (
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
                  transition={{ delay: 0.5 }}
                  className="pt-4 grid grid-cols-[1fr_2fr] gap-4"
                >
                  <DrawerClose asChild>
                    <Button
                      variant="outline"
                      type="button"
                      className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-colors hover:bg-white/5"
                      style={{
                        border: "1px solid hsl(0 0% 20%)",
                        color: "hsl(0 0% 60%)",
                        background: "transparent",
                      }}
                    >
                      Abort
                    </Button>
                  </DrawerClose>
                  <Button
                    type="submit"
                    className="h-14 rounded-none uppercase tracking-[0.2em] text-[10px] font-mono transition-all"
                    style={{
                      background: "hsl(142 60% 52% / 0.15)",
                      color: "hsl(142 55% 55%)",
                      border: "1px solid hsl(142 60% 52% / 0.3)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "hsl(142 60% 52% / 0.25)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        "hsl(142 60% 52% / 0.15)")
                    }
                  >
                    Submit Entry
                  </Button>
                </motion.div>
              </form>
            </Form>
          </div>
        </motion.div>
      </DrawerContent>
    </Drawer>
  );
}
