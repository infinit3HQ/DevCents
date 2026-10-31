import { useRef, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { AlertTriangle, Download, FileJson, Upload } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useEncryption } from "@/contexts/EncryptionContext";
import { normalizeCategory } from "@/lib/categoryUtils";
import { parseRules, serializeRules } from "@devcents/shared/categoryRules";
import { cn } from "@/lib/utils";

const BACKUP_FORMAT = "devcents-backup";
const BACKUP_VERSION = 1;
const RESTORE_BATCH = 200;

type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: {
    transactions: Record<string, unknown>[];
    planned: Record<string, unknown>[];
    recurring: Record<string, unknown>[];
    postedRecurringOccurrences: Record<string, unknown>[];
    categoryBudgets: Record<string, unknown>[];
    budgets: Record<string, unknown>[];
    categoryRules: { data: string; encrypted?: boolean } | null;
    encryption: { salt: string; verificationHash: string } | null;
    baseCurrency: string | null;
  };
};

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function localDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const today = () => localDate(Date.now());

function ActionRow({
  icon: Icon,
  label,
  detail,
  action,
  onClick,
  disabled,
}: {
  icon: typeof Download;
  label: string;
  detail: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4 border border-border bg-card">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-foreground/90">{label}</p>
          <p className="font-mono text-[10px] mt-0.5 text-muted-foreground">{detail}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
      >
        {action}
      </button>
    </div>
  );
}

export function DataSection() {
  const convex = useConvex();
  const transactions = useDecryptedTransactions();
  const { isEnabled, isUnlocked, encryptValue, decryptValue } = useEncryption();
  const restoreBatch = useMutation(api.backup.restoreBatch);
  const setupEncryption = useMutation(api.encryptionSettings.setup);
  const saveRules = useMutation(api.categoryRules.save);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);

  const locked = isEnabled && !isUnlocked;

  const exportCsv = () => {
    if (!transactions) return;
    const header = ["date", "description", "amount", "type", "category", "currency"];
    const lines = [...transactions]
      .sort((a, b) => a.date - b.date)
      .map((t) => {
        const slug = normalizeCategory(t.category, t.type);
        return [
          localDate(t.date),
          t.description,
          t.amount,
          t.type,
          slug,
          t.currency || "USD",
        ]
          .map(csvCell)
          .join(",");
      });
    download(`devcents-transactions-${today()}.csv`, [header.join(","), ...lines].join("\n"), "text/csv;charset=utf-8");
    setMessage({
      tone: "ok",
      text: `Exported ${lines.length} transactions. The file is not encrypted, so store it somewhere private. Import it back through CSV import.`,
    });
  };

  const exportBackup = async () => {
    setBusy("backup");
    setMessage(null);
    try {
      const data = await convex.query(api.backup.exportAll, {});
      const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
      download(`devcents-backup-${today()}.json`, JSON.stringify(backup), "application/json");
      setMessage({
        tone: "ok",
        text: data.encryption
          ? "Backup downloaded. Amounts and descriptions stay encrypted; you need your passphrase to read them after a restore."
          : "Backup downloaded. Encryption is off, so the file contains readable data.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Backup failed." });
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    setMessage(null);
    try {
      const parsed = JSON.parse(await file.text()) as Backup;
      if (parsed?.format !== BACKUP_FORMAT || typeof parsed.version !== "number" || !parsed.data) {
        throw new Error("This isn't a DevCents backup file.");
      }
      if (parsed.version > BACKUP_VERSION) {
        throw new Error("This backup was made by a newer version of DevCents.");
      }
      const current = await convex.query(api.encryptionSettings.get, {});
      const backupEnc = parsed.data.encryption;
      if (backupEnc && current && backupEnc.salt !== current.salt) {
        throw new Error(
          "This backup was encrypted with a different passphrase setup than this account, so its data couldn't be decrypted here.",
        );
      }
      setPending(parsed);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not read the file." });
    }
  };

  const restore = async (backup: Backup) => {
    setBusy("restore");
    setMessage(null);
    const d = backup.data;
    try {
      const current = await convex.query(api.encryptionSettings.get, {});
      if (d.encryption && !current) {
        // Fresh account: adopt the backup's encryption setup so the restored
        // ciphertext can be unlocked with the original passphrase.
        await setupEncryption({ salt: d.encryption.salt, verificationHash: d.encryption.verificationHash });
      }

      const idMap: Record<string, string> = {};
      let inserted = 0;
      let skipped = 0;
      const run = async (
        table: "transactions" | "planned" | "recurring" | "postedRecurringOccurrences" | "categoryBudgets" | "budgets",
        rows: Record<string, unknown>[],
      ) => {
        for (let i = 0; i < rows.length; i += RESTORE_BATCH) {
          setBusy(`restore:${table} ${Math.min(i + RESTORE_BATCH, rows.length)}/${rows.length}`);
          const res = await restoreBatch({ table, rows: rows.slice(i, i + RESTORE_BATCH), idMap });
          Object.assign(idMap, res.assigned);
          inserted += res.inserted;
          skipped += res.skipped;
        }
      };
      // Order matters: planned rows reference transactions, occurrences reference recurring.
      await run("transactions", d.transactions ?? []);
      await run("planned", d.planned ?? []);
      await run("recurring", d.recurring ?? []);
      await run("postedRecurringOccurrences", d.postedRecurringOccurrences ?? []);
      await run("categoryBudgets", d.categoryBudgets ?? []);
      await run("budgets", d.budgets ?? []);

      let rulesNote = "";
      if (d.categoryRules) {
        const existing = await convex.query(api.categoryRules.get, {});
        if (!existing) {
          await saveRules({ data: d.categoryRules.data, encrypted: d.categoryRules.encrypted });
        } else if (!isEnabled || isUnlocked) {
          const read = async (r: { data: string; encrypted?: boolean }) =>
            parseRules(r.encrypted ? await decryptValue(r.data) : r.data);
          const merged = { ...(await read(d.categoryRules)), ...(await read(existing)) };
          const json = serializeRules(merged);
          const shouldEncrypt = isEnabled && isUnlocked;
          await saveRules({ data: shouldEncrypt ? await encryptValue(json) : json, encrypted: shouldEncrypt });
        } else {
          rulesNote = " Learned categories were skipped because encryption is locked.";
        }
      }

      setMessage({
        tone: "ok",
        text: `Restore finished: ${inserted} rows added, ${skipped} already present.${rulesNote}${
          d.encryption && !current ? " Unlock with the passphrase you used when this backup was made." : ""
        }`,
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? `Restore stopped: ${err.message}` : "Restore failed." });
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const counts = pending
    ? [
        `${pending.data.transactions?.length ?? 0} transactions`,
        `${pending.data.planned?.length ?? 0} planned`,
        `${pending.data.recurring?.length ?? 0} recurring`,
        `${pending.data.categoryBudgets?.length ?? 0} category budgets`,
      ].join(", ")
    : "";

  return (
    <div className="border-b border-border">
      <div className="px-6 py-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-0.5">data</p>
        <p className="font-mono text-[11px] text-muted-foreground/60 mb-4">
          export your ledger or keep a full backup. with encryption on, a forgotten passphrase can't be recovered, so keep a backup.
        </p>
        <div className="mt-4 space-y-3">
          <ActionRow
            icon={Download}
            label="export transactions (csv)"
            detail={locked ? "unlock encryption first" : "readable spreadsheet · re-importable via CSV import"}
            action="export"
            onClick={exportCsv}
            disabled={locked || !transactions || !!busy}
          />
          <ActionRow
            icon={FileJson}
            label="download full backup (json)"
            detail="everything incl. planned, recurring, budgets, learned categories · stays encrypted"
            action={busy === "backup" ? "working…" : "download"}
            onClick={exportBackup}
            disabled={!!busy}
          />
          <ActionRow
            icon={Upload}
            label="restore from backup"
            detail="adds missing rows only · existing data is never overwritten"
            action={busy?.startsWith("restore") ? busy.replace("restore:", "") || "working…" : "choose file"}
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onFile(file);
            }}
          />

          {pending && (
            <div className="px-4 py-3 border border-amber-500/30 bg-amber-500/5 font-mono text-[10px] text-amber-500 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Restore backup from {new Date(pending.exportedAt).toLocaleString()}? It contains {counts}. Rows already in
                  this account are skipped.
                  {pending.data.encryption &&
                    " The data is encrypted; you'll need the passphrase that was active when the backup was made."}
                </span>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="h-7 px-3 border border-border text-muted-foreground uppercase tracking-widest"
                >
                  cancel
                </button>
                <button
                  type="button"
                  onClick={() => void restore(pending)}
                  className="h-7 px-3 border border-primary/40 bg-primary/10 text-primary uppercase tracking-widest"
                >
                  restore
                </button>
              </div>
            </div>
          )}

          {message && (
            <p
              role="status"
              className={cn("font-mono text-[10px]", message.tone === "error" ? "text-destructive" : "text-muted-foreground")}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
