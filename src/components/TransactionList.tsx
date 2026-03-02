import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Trash2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { Id } from "../../convex/_generated/dataModel";
import { formatAmountOnly } from "@/lib/currencyUtils";

interface TransactionListProps {
  limit?: number;
  compact?: boolean;
}

export function TransactionList({
  limit,
  compact = false,
}: TransactionListProps) {
  const allTransactions = useDecryptedTransactions();
  const deleteTransaction = useMutation(api.transactions.remove);
  const transactions =
    limit && allTransactions
      ? allTransactions.slice(0, limit)
      : allTransactions;

  if (!transactions)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-8 text-center font-mono text-[10px] uppercase tracking-widest"
        style={{ color: "hsl(0 0% 32%)" }}
      >
        <span style={{ color: "hsl(142 55% 52%)" }}>$ </span>loading records...
      </motion.div>
    );

  if (transactions.length === 0)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="m-5 p-8 text-center font-mono text-[10px] uppercase tracking-widest"
        style={{ border: "1px dashed hsl(0 0% 16%)", color: "hsl(0 0% 32%)" }}
      >
        <span style={{ color: "hsl(142 55% 52%)" }}>→ </span>no records found.
        input required.
      </motion.div>
    );

  return (
    <div className={cn("pb-20 md:pb-4", compact && "pb-0")}>
      {/* ── MOBILE LIST ─────────────────────────────────────────── */}
      <div
        className="md:hidden divide-y"
        style={{ borderColor: "hsl(0 0% 11%)" }}
      >
        <AnimatePresence mode="popLayout">
          {transactions.map((t, index) => (
            <motion.div
              key={t._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.18, delay: index * 0.025 }}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors"
              style={{ borderBottom: "1px solid hsl(0 0% 10%)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "hsl(142 60% 52% / 0.04)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {/* Type icon */}
              <div
                className="w-7 h-7 flex items-center justify-center shrink-0"
                style={{
                  border:
                    t.type === "income"
                      ? "1px solid hsl(142 60% 52% / 0.3)"
                      : "1px solid hsl(3 90% 58% / 0.3)",
                  background:
                    t.type === "income"
                      ? "hsl(142 60% 52% / 0.08)"
                      : "hsl(3 90% 58% / 0.08)",
                  color:
                    t.type === "income" ? "hsl(142 55% 55%)" : "hsl(3 85% 60%)",
                }}
              >
                {t.type === "income" ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
              </div>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[12px] truncate text-foreground/90">
                  {t.description}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                    style={{
                      borderLeft: "2px solid hsl(0 0% 20%)",
                      paddingLeft: "5px",
                    }}
                  >
                    {t.category}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground opacity-60">
                    {new Date(t.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {/* Amount + delete */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="font-mono text-sm num-display"
                  style={{
                    color:
                      t.type === "income"
                        ? "hsl(142 55% 55%)"
                        : "hsl(120 3% 75%)",
                  }}
                >
                  {t.type === "income" ? "+" : "-"}
                  {formatAmountOnly(t.amount, t.currency || "USD")}
                </span>
                {!compact && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-none transition-colors"
                    style={{ color: "hsl(0 0% 28%)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "hsl(3 85% 60%)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "hsl(0 0% 28%)")
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTransaction({ id: t._id as Id<"transactions"> });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete</span>
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── DESKTOP TABLE ───────────────────────────────────────── */}
      <motion.table
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="hidden md:table w-full text-sm text-left border-collapse"
      >
        <thead>
          <tr style={{ borderBottom: "1px solid hsl(0 0% 12%)" }}>
            {["date", "category", "description", "amount", ""].map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  "px-4 py-2.5 font-mono font-normal text-[9px] uppercase tracking-[0.2em]",
                  i === 3 && "text-right",
                )}
                style={{ color: "hsl(0 0% 32%)", background: "hsl(0 0% 6%)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {transactions.map((t, index) => (
              <motion.tr
                key={t._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, delay: index * 0.02 }}
                className="group cursor-default tr-hover"
                style={{ borderBottom: "1px solid hsl(0 0% 10%)" }}
              >
                <td
                  className="px-4 py-3 font-mono text-[10px] whitespace-nowrap"
                  style={{ color: "hsl(0 0% 38%)" }}
                >
                  {new Date(t.date).toLocaleDateString(undefined, {
                    month: "2-digit",
                    day: "2-digit",
                    year: "2-digit",
                  })}
                </td>
                <td
                  className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider"
                  style={{ color: "hsl(0 0% 38%)" }}
                >
                  {t.category}
                </td>
                <td
                  className="px-4 py-3 font-mono text-[12px] truncate max-w-[200px]"
                  style={{ color: "hsl(120 3% 75%)" }}
                >
                  {t.description}
                </td>
                <td
                  className="px-4 py-3 text-right font-mono text-[13px] num-display"
                  style={{
                    color:
                      t.type === "income"
                        ? "hsl(142 55% 55%)"
                        : "hsl(120 3% 78%)",
                  }}
                >
                  {t.type === "income" ? "+" : "-"}
                  {formatAmountOnly(t.amount, t.currency || "USD")}
                </td>
                <td className="px-4 py-3 w-10 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "hsl(0 0% 32%)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "hsl(3 85% 60%)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "hsl(0 0% 32%)")
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTransaction({ id: t._id as Id<"transactions"> });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </motion.table>
    </div>
  );
}
