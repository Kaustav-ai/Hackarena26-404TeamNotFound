import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import AdjustShareDrawer from "@/components/AdjustShareDrawer";
import SplitTransactionDrawer from "@/components/SplitTransactionDrawer";
import CategoryPickerDrawer from "@/components/CategoryPickerDrawer";

type SortMode = "amount-desc" | "amount-asc" | "date-desc" | "date-asc";

const SORT_CYCLE: SortMode[] = ["amount-desc", "amount-asc", "date-desc", "date-asc"];
const SORT_LABELS: Record<SortMode, string> = {
  "amount-desc": "Amt ↓",
  "amount-asc": "Amt ↑",
  "date-desc": "Date ↓",
  "date-asc": "Date ↑",
};

const StatementInterview = () => {
  const { importId } = useParams<{ importId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [aiQuestion, setAiQuestion] = useState("");
  const [showCategorize, setShowCategorize] = useState(false);
  const [showAdjustShare, setShowAdjustShare] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("amount-desc");
  const [note, setNote] = useState("");
  const [bulkPrompt, setBulkPrompt] = useState<{
    payee: string;
    categoryId: string;
    categoryName: string;
    matchIds: string[];
    count: number;
  } | null>(null);

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["imported-transactions", importId],
    queryFn: async () => {
      const { data } = await supabase
        .from("imported_transactions")
        .select("*, categories(name, icon)")
        .eq("import_id", importId!)
        .eq("is_reviewed", false)
        .order("original_amount", { ascending: false });
      return data ?? [];
    },
    enabled: !!importId && !!user,
  });

  const { data: importData } = useQuery({
    queryKey: ["import-data", importId],
    queryFn: async () => {
      const { data } = await supabase
        .from("statement_imports")
        .select("*")
        .eq("id", importId!)
        .single();
      return data;
    },
    enabled: !!importId,
  });

  const sortedTransactions = useMemo(() => {
    if (!transactions) return [];
    const sorted = [...transactions];
    switch (sortBy) {
      case "amount-desc":
        sorted.sort((a, b) => Number(b.original_amount) - Number(a.original_amount));
        break;
      case "amount-asc":
        sorted.sort((a, b) => Number(a.original_amount) - Number(b.original_amount));
        break;
      case "date-desc":
        sorted.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
        break;
      case "date-asc":
        sorted.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
        break;
    }
    return sorted;
  }, [transactions, sortBy]);

  const currentTx = sortedTransactions[currentIndex];
  const totalCount = importData?.total_transactions ?? sortedTransactions.length ?? 0;
  const reviewedCount = (importData?.reviewed_count ?? 0) + currentIndex;

  // Reset note when transaction changes
  useEffect(() => {
    setNote((currentTx as any)?.notes ?? "");
    setBulkPrompt(null);
  }, [currentTx?.id]);

  // Fetch AI question for current transaction
  useEffect(() => {
    if (!currentTx || bulkPrompt) return;
    const fetchQuestion = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-interview`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.session?.access_token}`,
            },
            body: JSON.stringify({ transactionId: currentTx.id }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          setAiQuestion(data.question);
        }
      } catch {
        setAiQuestion(`How would you like to categorize this ₹${currentTx.original_amount} transaction at "${currentTx.payee}"?`);
      }
    };
    fetchQuestion();
  }, [currentTx?.id, bulkPrompt]);

  const markReviewed = async () => {
    if (!currentTx || !importId) return;
    await supabase
      .from("imported_transactions")
      .update({ is_reviewed: true, notes: note || null } as any)
      .eq("id", currentTx.id);

    await supabase
      .from("statement_imports")
      .update({ reviewed_count: reviewedCount + 1 })
      .eq("id", importId);
  };

  const goNext = async () => {
    await markReviewed();
    if (currentIndex + 1 >= (sortedTransactions?.length ?? 0)) {
      queryClient.invalidateQueries({ queryKey: ["imported-transactions"] });
      navigate(`/review-complete/${importId}`);
    } else {
      setCurrentIndex((i) => i + 1);
      setAiQuestion("");
    }
  };

  const handleCategorize = async (categoryId: string, categoryName?: string) => {
    if (!currentTx || !user) return;
    await supabase
      .from("imported_transactions")
      .update({ category_id: categoryId })
      .eq("id", currentTx.id);

    // Upsert mapping rule
    const { data: existingRule } = await supabase
      .from("mapping_rules")
      .select("id")
      .eq("user_id", user.id)
      .eq("payee_pattern", currentTx.payee.toLowerCase())
      .maybeSingle();

    if (existingRule) {
      await supabase
        .from("mapping_rules")
        .update({ category_id: categoryId })
        .eq("id", existingRule.id);
    } else {
      await supabase.from("mapping_rules").insert({
        user_id: user.id,
        payee_pattern: currentTx.payee.toLowerCase(),
        category_id: categoryId,
      });
    }

    setShowCategorize(false);

    // Check for bulk categorization matches
    const matchingTxs = sortedTransactions.filter(
      (tx) =>
        tx.id !== currentTx.id &&
        !tx.is_reviewed &&
        tx.payee.toLowerCase() === currentTx.payee.toLowerCase()
    );

    if (matchingTxs.length > 0) {
      const resolvedName = categoryName || (currentTx.categories as any)?.name || "this category";
      setBulkPrompt({
        payee: currentTx.payee,
        categoryId,
        categoryName: resolvedName,
        matchIds: matchingTxs.map((tx) => tx.id),
        count: matchingTxs.length,
      });
    } else {
      await goNext();
    }
  };

  const handleBulkYes = async () => {
    if (!bulkPrompt || !importId) return;
    // Bulk update all matching transactions
    await supabase
      .from("imported_transactions")
      .update({ category_id: bulkPrompt.categoryId, is_reviewed: true } as any)
      .in("id", bulkPrompt.matchIds);

    // Also mark the current transaction as reviewed
    await markReviewed();

    // Increment reviewed count (current + bulk matches)
    await supabase
      .from("statement_imports")
      .update({ reviewed_count: (importData?.reviewed_count ?? 0) + currentIndex + 1 + bulkPrompt.count })
      .eq("id", importId);

    toast.success(`Bulk updated ${bulkPrompt.count} transactions to ${bulkPrompt.categoryName}`);
    setBulkPrompt(null);

    // Refetch and reset
    await queryClient.invalidateQueries({ queryKey: ["imported-transactions", importId] });
    await queryClient.invalidateQueries({ queryKey: ["import-data", importId] });
    setCurrentIndex(0);
    setAiQuestion("");
  };

  const handleBulkNo = async () => {
    setBulkPrompt(null);
    await goNext();
  };

  const handleIgnore = async () => {
    if (!currentTx) return;
    await supabase
      .from("imported_transactions")
      .update({ is_ignored: true })
      .eq("id", currentTx.id);
    toast("Transaction ignored");
    await goNext();
  };

  const handleSkip = async () => {
    await goNext();
  };

  const handleAdjustConfirm = async (adjustedAmount: number) => {
    if (!currentTx) return;
    await supabase
      .from("imported_transactions")
      .update({ adjusted_amount: adjustedAmount })
      .eq("id", currentTx.id);
    setShowAdjustShare(false);
    toast.success("Share adjusted");
  };

  const handleSplitConfirm = async () => {
    setShowSplit(false);
    toast.success("Transaction split saved");
    await goNext();
  };

  if (isLoading) {
    return (
      <div className="bg-deep-sea min-h-screen flex items-center justify-center">
        <div className="text-primary animate-pulse text-xl">Loading transactions...</div>
      </div>
    );
  }

  if (!currentTx) {
    return (
      <div className="bg-deep-sea min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground text-lg mb-4">No transactions to review</p>
          <Button onClick={() => navigate(`/review-complete/${importId}`)}>View Summary</Button>
        </div>
      </div>
    );
  }

  const cat = currentTx.categories as { name: string; icon: string } | null;
  const percentage = totalCount > 0 ? ((reviewedCount + 1) / totalCount) * 100 : 0;

  return (
    <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col pb-24">
      {/* Header */}
      <header className="pt-12 px-6 flex items-center justify-between">
        <button onClick={() => navigate("/statement-upload")} className="p-2 rounded-full glass-card">
          <span className="material-icons text-foreground">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold text-foreground">Statement Interview</h1>
        <button
          onClick={() => {
            const idx = SORT_CYCLE.indexOf(sortBy);
            setSortBy(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]);
            setCurrentIndex(0);
            setAiQuestion("");
          }}
          className="p-2 rounded-full glass-card flex items-center gap-1"
        >
          <span className="material-icons text-foreground text-sm">filter_list</span>
          <span className="text-xs text-muted-foreground">{SORT_LABELS[sortBy]}</span>
        </button>
      </header>

      {/* Progress */}
      <div className="px-6 mt-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Reviewing</span>
          <span className="text-xs font-bold text-primary">{reviewedCount + 1} of {totalCount}</span>
        </div>
        <Progress value={percentage} className="h-1.5" />
      </div>

      {/* AI Chat Bubble */}
      <div className="px-6 mt-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center flex-shrink-0">
            <span className="material-icons text-primary text-lg">auto_awesome</span>
          </div>
          <div className="glass-card rounded-2xl rounded-tl-md p-4 flex-1">
            {bulkPrompt ? (
              <div>
                <p className="text-foreground text-sm leading-relaxed">
                  I see <span className="font-bold text-primary">{bulkPrompt.count}</span> other transaction{bulkPrompt.count > 1 ? "s" : ""} to <span className="font-bold">"{bulkPrompt.payee}"</span>. Move them all to <span className="font-bold text-primary">{bulkPrompt.categoryName}</span>?
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleBulkYes} className="shadow-neon">Yes</Button>
                  <Button size="sm" variant="outline" onClick={handleBulkNo}>No</Button>
                </div>
              </div>
            ) : (
              <p className="text-foreground text-sm leading-relaxed">
                {aiQuestion || "Analyzing this transaction..."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transaction Card */}
      <div className="px-6 mt-5 flex-1">
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />

          <div className="flex items-center justify-between mb-6">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
              <span className="material-icons text-primary text-xl">{cat?.icon || "shopping_bag"}</span>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Date</p>
              <p className="text-sm font-semibold text-foreground">
                {new Date(currentTx.transaction_date).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="text-center mb-4">
            <h2 className="text-4xl font-extrabold text-foreground">
              <span className="text-2xl text-primary">₹</span>
              {Number(currentTx.original_amount).toLocaleString("en-IN")}
              <span className="text-xl text-muted-foreground">.00</span>
            </h2>
            <p className="text-muted-foreground mt-2 text-base">{currentTx.payee}</p>
            <span className={`inline-block mt-1 text-xs font-semibold ${currentTx.type === "income" ? "text-green-500" : "text-destructive"}`}>
              {currentTx.type === "income" ? "Credited" : "Debited"}
            </span>
            {cat && (
              <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-accent text-xs text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {cat.name}
              </span>
            )}
          </div>

          {currentTx.duplicate_of && (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-secondary/50">
              <span className="material-icons text-muted-foreground text-sm">history</span>
              <span className="text-xs text-muted-foreground">Previous: Similar transaction found</span>
              <span className="ml-auto text-xs text-muted-foreground line-through">
                ₹{Number(currentTx.original_amount).toLocaleString("en-IN")}
              </span>
            </div>
          )}

          {Number(currentTx.adjusted_amount) !== Number(currentTx.original_amount) && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-primary/10">
              <span className="material-icons text-primary text-sm">tune</span>
              <span className="text-xs text-primary">Adjusted to ₹{Number(currentTx.adjusted_amount).toLocaleString("en-IN")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="px-6 mt-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note about this transaction..."
          className="glass-card border-border/50 rounded-xl text-sm min-h-[60px] resize-none"
          onBlur={async () => {
            if (currentTx) {
              await supabase
                .from("imported_transactions")
                .update({ notes: note || null } as any)
                .eq("id", currentTx.id);
            }
          }}
        />
      </div>

      {/* Navigation + Action Buttons */}
      <div className="px-6 mt-4">
        {/* Previous / Next navigation */}
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentIndex === 0}
            onClick={() => {
              setCurrentIndex((i) => i - 1);
              setAiQuestion("");
            }}
            className="gap-1 text-muted-foreground"
          >
            <span className="material-icons text-lg">arrow_back</span>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} / {sortedTransactions.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentIndex + 1 >= sortedTransactions.length}
            onClick={() => {
              setCurrentIndex((i) => i + 1);
              setAiQuestion("");
            }}
            className="gap-1 text-muted-foreground"
          >
            Next
            <span className="material-icons text-lg">arrow_forward</span>
          </Button>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => setShowCategorize(true)}
            className="flex-[2] h-20 flex-col gap-1 rounded-2xl shadow-neon text-base font-bold"
          >
            <span className="material-icons text-2xl">category</span>
            Categorize
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAdjustShare(true)}
            className="flex-1 h-20 flex-col gap-1 rounded-2xl border-border/50"
          >
            <span className="material-icons text-xl text-primary">pie_chart</span>
            <span className="text-xs">Adjust Share</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowSplit(true)}
            className="flex-1 h-20 flex-col gap-1 rounded-2xl border-border/50"
          >
            <span className="material-icons text-xl text-primary">call_split</span>
            <span className="text-xs">Split Items</span>
          </Button>
        </div>

        <div className="flex gap-3 mt-3">
          <Button variant="ghost" onClick={handleSkip} className="flex-1 text-muted-foreground">
            Skip
          </Button>
          <Button variant="ghost" onClick={handleIgnore} className="flex-1 text-destructive">
            Ignore
          </Button>
        </div>
      </div>

      {/* Drawers */}
      <CategoryPickerDrawer
        open={showCategorize}
        onOpenChange={setShowCategorize}
        onSelect={handleCategorize}
      />
      <AdjustShareDrawer
        open={showAdjustShare}
        onOpenChange={setShowAdjustShare}
        payee={currentTx.payee}
        totalAmount={Number(currentTx.original_amount)}
        currentAdjusted={Number(currentTx.adjusted_amount)}
        onConfirm={handleAdjustConfirm}
      />
      <SplitTransactionDrawer
        open={showSplit}
        onOpenChange={setShowSplit}
        transactionId={currentTx.id}
        payee={currentTx.payee}
        totalAmount={Number(currentTx.original_amount)}
        transactionDate={currentTx.transaction_date}
        onConfirm={handleSplitConfirm}
      />
    </div>
  );
};

export default StatementInterview;
