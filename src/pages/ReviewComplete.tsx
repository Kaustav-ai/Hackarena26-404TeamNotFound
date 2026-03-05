import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const TROPHY_DEFS = [
  { id: "detective", check: (p: any) => (p.total_statements_analyzed ?? 0) >= 10 },
  { id: "splitter", check: (p: any) => (p.total_bills_split ?? 0) >= 50 },
  { id: "consistent_king", check: (p: any) => (p.current_streak ?? 0) >= 30 },
];

const ReviewComplete = () => {
  const { importId } = useParams<{ importId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [finalizing, setFinalizing] = useState(false);

  const { data: transactions } = useQuery({
    queryKey: ["all-imported-txns", importId],
    queryFn: async () => {
      const { data } = await supabase
        .from("imported_transactions")
        .select("*")
        .eq("import_id", importId!);
      return data ?? [];
    },
    enabled: !!importId,
  });

  const { data: splitItems } = useQuery({
    queryKey: ["all-splits", importId],
    queryFn: async () => {
      if (!transactions) return [];
      const txIds = transactions.map((t) => t.id);
      const { data } = await supabase
        .from("split_items")
        .select("*")
        .in("imported_transaction_id", txIds);
      return data ?? [];
    },
    enabled: !!transactions && transactions.length > 0,
  });

  const categorized = transactions?.filter((t) => t.category_id && !t.is_ignored).length ?? 0;
  const ignored = transactions?.filter((t) => t.is_ignored).length ?? 0;
  const splitCount = new Set(splitItems?.map((s) => s.imported_transaction_id)).size;

  // Check if this import is already complete
  const { data: importData } = useQuery({
    queryKey: ["import-status", importId],
    queryFn: async () => {
      const { data } = await supabase
        .from("statement_imports")
        .select("status")
        .eq("id", importId!)
        .maybeSingle();
      return data;
    },
    enabled: !!importId,
  });

  const isAlreadyComplete = importData?.status === "complete";

  const handleDone = async () => {
    if (!user || !transactions) return;
    if (isAlreadyComplete) {
      navigate("/");
      return;
    }
    setFinalizing(true);

    try {
      // Get user's default account
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, balance")
        .eq("user_id", user.id)
        .limit(1);

      const defaultAccount = accounts?.[0];
      if (!defaultAccount) {
        toast.error("No account found. Please create one first.");
        setFinalizing(false);
        return;
      }

      let balanceChange = 0;

      // Batch insert non-ignored transactions into main transactions table
      const toInsert = transactions
        .filter((t) => !t.is_ignored)
        .map((t) => {
          const amount = Number(t.adjusted_amount);
          balanceChange += t.type === "income" ? amount : -amount;
          return {
            user_id: user.id,
            account_id: defaultAccount.id,
            category_id: t.category_id,
            amount,
            type: t.type,
            description: t.payee,
            transaction_date: t.transaction_date,
            notes: t.notes || null,
          };
        });

      if (toInsert.length > 0) {
        const { error } = await supabase.from("transactions").insert(toInsert);
        if (error) throw error;
      }

      // Update account balance
      await supabase
        .from("accounts")
        .update({ balance: defaultAccount.balance + balanceChange })
        .eq("id", defaultAccount.id);

      // Mark import as complete
      await supabase
        .from("statement_imports")
        .update({ status: "complete" })
        .eq("id", importId!);

      // === GAMIFICATION: Update streak, XP, and trophies ===
      const { data: profile } = await supabase
        .from("profiles")
        .select("current_streak, last_activity_date, total_xp, total_statements_analyzed, total_bills_split, unlocked_trophies")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        const today = new Date().toISOString().split("T")[0];
        const lastDate = profile.last_activity_date;
        let newStreak = profile.current_streak ?? 0;

        if (lastDate === today) {
          // Already active today, no streak change
        } else if (lastDate) {
          const last = new Date(lastDate);
          const todayDate = new Date(today);
          const diffDays = Math.floor((todayDate.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            newStreak += 1;
          } else {
            newStreak = 1;
          }
        } else {
          newStreak = 1;
        }

        const newXP = (profile.total_xp ?? 0) + 50;
        const newStatementsAnalyzed = (profile.total_statements_analyzed ?? 0) + 1;
        const newBillsSplit = (profile.total_bills_split ?? 0) + splitCount;

        // Check trophy unlocks
        const currentTrophies = Array.isArray(profile.unlocked_trophies) ? [...profile.unlocked_trophies] : [];
        const updatedProfile = {
          current_streak: newStreak,
          total_xp: newXP,
          total_statements_analyzed: newStatementsAnalyzed,
          total_bills_split: newBillsSplit,
        };

        for (const trophy of TROPHY_DEFS) {
          if (!currentTrophies.includes(trophy.id) && trophy.check(updatedProfile)) {
            currentTrophies.push(trophy.id);
          }
        }

        await supabase
          .from("profiles")
          .update({
            current_streak: newStreak,
            last_activity_date: today,
            total_xp: newXP,
            total_statements_analyzed: newStatementsAnalyzed,
            total_bills_split: newBillsSplit,
            unlocked_trophies: currentTrophies,
          })
          .eq("user_id", user.id);
      }

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Transactions added to your dashboard!");
      navigate("/mission-accomplished");
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize");
    }
    setFinalizing(false);
  };

  return (
    <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col items-center justify-center px-6">
      {/* Celebration Graphic */}
      <div className="relative mb-8">
        {/* Outer glow rings */}
        <div className="absolute inset-0 w-48 h-48 rounded-full border border-primary/10 animate-pulse" style={{ margin: "-24px" }} />
        <div className="absolute inset-0 w-40 h-40 rounded-full border border-primary/20" style={{ margin: "-8px" }} />
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-neon-strong">
          <span className="material-icons text-5xl text-primary-foreground">check</span>
        </div>
      </div>

      <h1 className="text-3xl font-extrabold text-foreground text-center">Clean up complete!</h1>
      <p className="text-muted-foreground mt-2 text-center">Your statement is now neat and tidy.</p>

      {/* Summary Card */}
      <div className="glass-card rounded-2xl p-6 mt-8 w-full">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5">Summary of Changes</h3>

        <div className="space-y-0">
          <div className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-icons text-primary">category</span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">{categorized}</p>
              <p className="text-sm text-muted-foreground">Transactions Categorized</p>
            </div>
          </div>
          <div className="border-t border-border/30" />

          <div className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-icons text-primary">call_split</span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">{splitCount}</p>
              <p className="text-sm text-muted-foreground">Bills Split</p>
            </div>
          </div>
          <div className="border-t border-border/30" />

          <div className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-icons text-primary">remove_circle_outline</span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">{ignored}</p>
              <p className="text-sm text-muted-foreground">Duplicates Ignored</p>
            </div>
          </div>
        </div>
      </div>

      {/* Done Button */}
      <Button
        onClick={handleDone}
        disabled={finalizing}
        className="w-full h-14 mt-8 mb-12 text-lg font-bold rounded-2xl shadow-neon"
      >
        {finalizing ? "Finalizing..." : isAlreadyComplete ? "Back to Home →" : "Done →"}
      </Button>
    </div>
  );
};

export default ReviewComplete;
