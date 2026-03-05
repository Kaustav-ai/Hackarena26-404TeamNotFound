import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

const ACCOUNT_ICONS: Record<string, string> = {
  cash: "account_balance_wallet",
  bank: "account_balance",
  credit_card: "credit_card",
  wallet: "wallet",
  other: "savings",
};

const Accounts = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [balance, setBalance] = useState("");

  // Edit balance state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("*").eq("user_id", user!.id).order("created_at");
      return data ?? [];
    },
    enabled: !!user,
  });

  const totalBalance = accounts?.reduce((s, a) => s + a.balance, 0) ?? 0;

  const handleAdd = async () => {
    if (!user || !name) return;
    const { error } = await supabase.from("accounts").insert({
      user_id: user.id,
      name,
      type,
      icon: ACCOUNT_ICONS[type] || "account_balance_wallet",
      balance: parseFloat(balance) || 0,
    });
    if (error) toast.error("Failed to add account");
    else {
      toast.success("Account added!");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setShowAdd(false);
      setName("");
      setBalance("");
    }
  };

  const handleUpdateBalance = async (accountId: string) => {
    const newBalance = parseFloat(editBalance);
    if (isNaN(newBalance)) return;
    const { error } = await supabase
      .from("accounts")
      .update({ balance: newBalance })
      .eq("id", accountId);
    if (error) toast.error("Failed to update balance");
    else {
      toast.success("Balance updated!");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditingId(null);
    }
  };

  return (
    <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col pb-24">
      <header className="pt-12 px-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your wallets</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="shadow-neon">
          <span className="material-icons text-sm mr-1">add</span> Add
        </Button>
      </header>

      {/* Total */}
      <div className="glass-card rounded-xl mx-6 mt-6 p-5 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Net Worth</p>
        <p className="text-3xl font-extrabold text-foreground mt-1">₹{totalBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
      </div>

      {/* Account list */}
      <div className="px-6 mt-6 space-y-3 flex-1 overflow-y-auto no-scrollbar">
        {accounts?.map((acc) => (
          <div key={acc.id} className="glass-card rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                  <span className="material-icons text-primary text-xl">{acc.icon}</span>
                </div>
                <div>
                  <h4 className="font-bold text-foreground">{acc.name}</h4>
                  <p className="text-xs text-muted-foreground capitalize">{acc.type.replace("_", " ")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-base ${acc.balance >= 0 ? "text-foreground" : "text-destructive"}`}>
                  ₹{acc.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <button
                  onClick={() => {
                    if (editingId === acc.id) {
                      setEditingId(null);
                    } else {
                      setEditingId(acc.id);
                      setEditBalance(String(acc.balance));
                    }
                  }}
                  className="p-1.5 rounded-full hover:bg-accent/50 transition-colors"
                >
                  <span className="material-icons text-muted-foreground text-lg">
                    {editingId === acc.id ? "close" : "edit"}
                  </span>
                </button>
              </div>
            </div>

            {/* Inline edit */}
            {editingId === acc.id && (
              <div className="mt-3 pt-3 border-t border-border/30 flex gap-2">
                <Input
                  type="number"
                  value={editBalance}
                  onChange={(e) => setEditBalance(e.target.value)}
                  placeholder="New balance"
                  className="bg-secondary/50 border-border text-foreground flex-1"
                />
                <Button size="sm" onClick={() => handleUpdateBalance(acc.id)} className="shadow-neon">
                  Update
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add sheet */}
      <Sheet open={showAdd} onOpenChange={setShowAdd}>
        <SheetContent side="bottom" className="bg-deep-sea border-border/30 rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-foreground">Add Account</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <Label className="text-muted-foreground">Account Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Bank" className="mt-1 bg-secondary/50 border-border text-foreground" />
            </div>
            <div>
              <Label className="text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1 bg-secondary/50 border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {Object.keys(ACCOUNT_ICONS).map((t) => (
                    <SelectItem key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground">Opening Balance (₹)</Label>
              <Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" className="mt-1 bg-secondary/50 border-border text-foreground" />
            </div>
            <Button onClick={handleAdd} disabled={!name} className="w-full h-12 font-bold shadow-neon">Add Account</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Accounts;
