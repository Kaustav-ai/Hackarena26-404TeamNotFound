import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

interface SplitRow {
  categoryId: string;
  amount: number;
}

interface SplitTransactionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  payee: string;
  totalAmount: number;
  transactionDate: string;
  onConfirm: () => void;
}

const SplitTransactionDrawer = ({
  open,
  onOpenChange,
  transactionId,
  payee,
  totalAmount,
  transactionDate,
  onConfirm,
}: SplitTransactionDrawerProps) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<SplitRow[]>([{ categoryId: "", amount: 0 }]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, icon, type");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open) setRows([{ categoryId: "", amount: 0 }]);
  }, [open]);

  const assigned = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const remaining = totalAmount - assigned;
  const canConfirm = remaining === 0 && rows.every((r) => r.categoryId && r.amount > 0);

  const updateRow = (index: number, field: keyof SplitRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (!user || !canConfirm) return;
    // Delete existing splits for this transaction
    await supabase.from("split_items").delete().eq("imported_transaction_id", transactionId);

    // Insert new splits
    const items = rows.map((r) => ({
      imported_transaction_id: transactionId,
      category_id: r.categoryId,
      amount: r.amount,
      user_id: user.id,
    }));

    const { error } = await supabase.from("split_items").insert(items);
    if (error) {
      console.error("Split insert error:", error);
      return;
    }
    onConfirm();
  };

  const expenseCategories = categories?.filter((c) => c.type === "expense") ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-deep-sea border-border/30 rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground text-xl">Split Transaction</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mt-1">
          Break down this transaction into multiple categories.
        </p>

        {/* Transaction info */}
        <div className="glass-card rounded-xl p-4 mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
              <span className="material-icons text-primary">shopping_cart</span>
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{payee}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(transactionDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-muted-foreground">Total</p>
            <p className="font-bold text-foreground">₹{totalAmount.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* Assigned / Remaining */}
        <div className="flex justify-between mt-4 text-sm">
          <span className="text-muted-foreground">
            Assigned: <span className="text-success font-semibold">₹{assigned.toLocaleString("en-IN")}</span>
          </span>
          <span className="text-muted-foreground">
            Remaining: <span className="text-foreground font-semibold">₹{remaining.toLocaleString("en-IN")}</span>
          </span>
        </div>

        {/* Split rows */}
        <div className="space-y-3 mt-4">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                <span className="material-icons text-primary text-sm">
                  {expenseCategories.find((c) => c.id === row.categoryId)?.icon || "label"}
                </span>
              </div>
              <Select value={row.categoryId} onValueChange={(v) => updateRow(i, "categoryId", v)}>
                <SelectTrigger className="flex-1 bg-secondary/50 border-border text-foreground text-xs h-10">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center bg-secondary/50 border border-border rounded-md px-2 h-10 w-28">
                <span className="text-muted-foreground text-xs mr-1">₹</span>
                <Input
                  type="number"
                  value={row.amount || ""}
                  onChange={(e) => updateRow(i, "amount", Number(e.target.value))}
                  className="border-0 bg-transparent p-0 h-auto text-foreground text-sm focus-visible:ring-0"
                  placeholder="0"
                />
              </div>
              <button onClick={() => removeRow(i)} className="p-1 text-muted-foreground hover:text-destructive">
                <span className="material-icons text-lg">remove_circle_outline</span>
              </button>
            </div>
          ))}
        </div>

        {/* Add split */}
        <button
          onClick={() => setRows((prev) => [...prev, { categoryId: "", amount: 0 }])}
          className="w-full mt-3 p-3 border border-dashed border-border/50 rounded-xl text-muted-foreground text-sm flex items-center justify-center gap-2 hover:border-primary/50 transition-colors"
        >
          <span className="material-icons text-lg">add_circle_outline</span>
          Add Split Category
        </button>

        {/* Buttons */}
        <div className="flex gap-3 mt-6 pb-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 h-12 rounded-xl border-border/50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 h-12 rounded-xl shadow-neon font-bold"
          >
            <span className="material-icons text-sm mr-1">check</span>
            Confirm Split
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SplitTransactionDrawer;
