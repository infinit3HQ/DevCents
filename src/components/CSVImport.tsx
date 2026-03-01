import { useState, useCallback, useMemo, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, XSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { suggestCategory, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/categoryUtils';
import { useEncryption } from '@/components/EncryptionProvider';

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  valid: boolean;
  error?: string;
}

interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  type: number;
}

const EXPECTED_HEADERS = ['date', 'description', 'amount', 'type'];

function detectColumnMapping(headers: string[]): ColumnMapping {
  const lower = headers.map(h => h.toLowerCase().trim());
  return {
    date: Math.max(0, lower.findIndex(h => ['date', 'time', 'timestamp', 'when'].includes(h))),
    description: Math.max(0, lower.findIndex(h => ['description', 'desc', 'memo', 'note', 'name', 'details', 'narration'].includes(h))),
    amount: Math.max(0, lower.findIndex(h => ['amount', 'value', 'sum', 'total', 'price'].includes(h))),
    type: lower.findIndex(h => ['type', 'kind', 'direction', 'credit/debit'].includes(h)),
  };
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function parseRow(row: string[], mapping: ColumnMapping): ParsedRow {
  try {
    const dateStr = row[mapping.date] || '';
    const description = row[mapping.description] || '';
    const amountStr = row[mapping.amount] || '0';
    const typeStr = mapping.type >= 0 ? (row[mapping.type] || '').toLowerCase() : '';

    const cleanAmount = amountStr.replace(/[^0-9.\-]/g, '');
    const amount = Math.abs(parseFloat(cleanAmount));

    if (isNaN(amount) || amount === 0) {
      return { date: dateStr, description, amount: 0, type: 'expense', category: 'other', valid: false, error: 'Invalid amount' };
    }

    const parsedDate = new Date(dateStr);
    if (isNaN(parsedDate.getTime())) {
      return { date: dateStr, description, amount, type: 'expense', category: 'other', valid: false, error: 'Invalid date' };
    }

    let type: 'income' | 'expense' = 'expense';
    if (typeStr.includes('income') || typeStr.includes('credit') || typeStr.includes('deposit')) {
      type = 'income';
    } else if (parseFloat(cleanAmount) > 0 && mapping.type < 0) {
      type = 'income';
    } else if (parseFloat(cleanAmount) < 0) {
      type = 'expense';
    }

    const category = suggestCategory(description);

    return { date: dateStr, description, amount, type, category, valid: true };
  } catch {
    return { date: '', description: '', amount: 0, type: 'expense', category: 'other', valid: false, error: 'Parse error' };
  }
}

export function CSVImport({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: 0, description: 1, amount: 2, type: -1 });
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState('');

  const createMany = useMutation(api.transactions.createMany);
  const { isEnabled, isUnlocked, encryptValue } = useEncryption();

  useEffect(() => {
    const handleOpenCSVImport = () => setOpen(true);
    document.addEventListener('open-csv-import', handleOpenCSVImport);
    return () => document.removeEventListener('open-csv-import', handleOpenCSVImport);
  }, []);

  const validCount = useMemo(() => rows.filter(r => r.valid).length, [rows]);
  const invalidCount = useMemo(() => rows.filter(r => !r.valid).length, [rows]);

  const reparse = useCallback((data: string[][], m: ColumnMapping) => {
    const parsed = data.map(row => parseRow(row, m));
    setRows(parsed);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setDone(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);

      if (parsed.length < 2) return;

      const headerRow = parsed[0];
      const dataRows = parsed.slice(1);
      const autoMapping = detectColumnMapping(headerRow);

      setHeaders(headerRow);
      setRawRows(dataRows);
      setMapping(autoMapping);
      reparse(dataRows, autoMapping);
    };
    reader.readAsText(file);
  }, [reparse]);

  const updateMapping = useCallback((field: keyof ColumnMapping, value: number) => {
    const newMapping = { ...mapping, [field]: value };
    setMapping(newMapping);
    reparse(rawRows, newMapping);
  }, [mapping, rawRows, reparse]);

  const updateRowCategory = useCallback((index: number, category: string) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, category } : r));
  }, []);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const validRows = rows.filter(r => r.valid);
      const shouldEncrypt = isEnabled && isUnlocked;

      const transactions = await Promise.all(
        validRows.map(async (r) => ({
          amount: shouldEncrypt ? await encryptValue(String(r.amount)) : r.amount,
          type: r.type,
          category: r.category,
          description: shouldEncrypt ? await encryptValue(r.description) : r.description,
          date: new Date(r.date).getTime(),
          encrypted: shouldEncrypt || undefined,
        }))
      );

      for (let i = 0; i < transactions.length; i += 100) {
        const batch = transactions.slice(i, i + 100);
        await createMany({ transactions: batch });
      }

      setDone(true);
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setImporting(false);
    }
  }, [rows, createMany, isEnabled, isUnlocked, encryptValue]);

  const reset = useCallback(() => {
    setHeaders([]);
    setRows([]);
    setRawRows([]);
    setFileName('');
    setDone(false);
    setMapping({ date: 0, description: 1, amount: 2, type: -1 });
  }, []);

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2 rounded-none border-2 border-border font-mono uppercase tracking-widest text-xs hover:bg-foreground hover:text-background transition-none">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto border-l-4 border-border/10 bg-background/95 backdrop-blur-xl">
        <SheetHeader className="border-b-2 border-border pb-6 mb-8 text-left">
          <SheetTitle className="font-serif text-4xl tracking-tight">Import Records</SheetTitle>
          <SheetDescription className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Batched transaction ingestion protocol.</SheetDescription>
        </SheetHeader>

        <div className="space-y-8">
          {!done && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <label
                className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border cursor-pointer hover:bg-foreground hover:text-background transition-colors group"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 text-muted-foreground group-hover:text-background mb-4" />
                  <p className="text-sm font-mono uppercase tracking-widest">
                    {fileName ? (
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {fileName}
                      </span>
                    ) : (
                      <span>Select <span className="text-primary group-hover:text-background font-bold">.csv</span> file</span>
                    )}
                  </p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </motion.div>
          )}

          {headers.length > 0 && !done && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <h4 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest border-b border-border pb-2">Column Mapping</h4>
              <div className="grid grid-cols-2 gap-4">
                {EXPECTED_HEADERS.map((field) => (
                  <div key={field} className="space-y-2">
                    <label className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{field}</label>
                    <Select
                      value={String(mapping[field as keyof ColumnMapping])}
                      onValueChange={(v) => updateMapping(field as keyof ColumnMapping, parseInt(v))}
                    >
                      <SelectTrigger className="h-10 text-xs rounded-none border-2 border-border font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-2 border-border">
                        {field === 'type' && (
                          <SelectItem value="-1" className="font-mono text-xs">Auto-detect</SelectItem>
                        )}
                        {headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)} className="font-mono text-xs">{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {rows.length > 0 && !done && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-end justify-between border-b border-border pb-2">
                <h4 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest">Preview</h4>
                <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> {validCount} valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="w-3 h-3" /> {invalidCount} errors
                    </span>
                  )}
                </div>
              </div>

              <div className="border-2 border-border overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-foreground text-background sticky top-0 font-mono uppercase tracking-widest">
                    <tr>
                      <th className="px-3 py-3 font-normal">Date</th>
                      <th className="px-3 py-3 font-normal">Description</th>
                      <th className="px-3 py-3 font-normal text-right">Amount</th>
                      <th className="px-3 py-3 font-normal">Cat</th>
                      <th className="px-3 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <AnimatePresence>
                      {rows.slice(0, 50).map((row, i) => (
                        <motion.tr
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className={`border-b border-border/50 ${!row.valid ? 'bg-destructive/10 text-destructive' : 'hover:bg-muted/30'}`}
                        >
                          <td className="px-3 py-3 whitespace-nowrap opacity-70">{row.date}</td>
                          <td className="px-3 py-3 truncate max-w-[120px] font-serif tracking-tight">{row.description}</td>
                          <td className="px-3 py-3 text-right">${row.amount.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <Select
                              value={row.category}
                              onValueChange={(v) => updateRowCategory(i, v)}
                            >
                              <SelectTrigger className="h-7 text-[10px] w-24 rounded-none border-border bg-transparent px-2 font-mono uppercase">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-none border-2 border-border font-mono text-[10px] uppercase">
                                {(row.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-3">
                            {!row.valid && (
                              <span title={row.error}>
                                <XSquare className="w-4 h-4 text-destructive" />
                              </span>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div className="px-3 py-3 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/50 border-t border-border">
                    Showing 50 of {rows.length} rows
                  </div>
                )}
              </div>

              <Button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="w-full gap-3 h-14 rounded-none border-2 border-foreground bg-background text-foreground hover:bg-foreground hover:text-background font-mono uppercase tracking-widest font-bold shadow-[4px_4px_0_0_hsl(var(--foreground))] hover:translate-y-1 hover:shadow-none transition-all"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Commit {validCount} Records
                  </>
                )}
              </Button>
            </motion.div>
          )}

          {done && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 space-y-6 border-2 border-border text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
              >
                <div className="w-20 h-20 bg-foreground text-background flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
              </motion.div>
              <div>
                <h3 className="text-2xl font-serif font-bold mb-2">Ingestion Complete</h3>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{validCount} records committed to ledger.</p>
              </div>
              <div className="flex gap-4 mt-4">
                <Button variant="outline" onClick={reset} className="rounded-none border-2 border-border font-mono uppercase tracking-widest text-xs px-6">New Batch</Button>
                <Button onClick={() => setOpen(false)} className="rounded-none bg-foreground text-background hover:bg-foreground/90 font-mono uppercase tracking-widest text-xs px-6">Close</Button>
              </div>
            </motion.div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
