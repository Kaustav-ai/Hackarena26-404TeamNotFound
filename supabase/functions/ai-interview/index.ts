import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { transactionId } = await req.json();
    if (!transactionId) {
      return new Response(JSON.stringify({ error: "Missing transactionId" }), { status: 400, headers: corsHeaders });
    }

    // Fetch the transaction
    const { data: tx, error: txError } = await supabase
      .from("imported_transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), { status: 404, headers: corsHeaders });
    }

    // Generate contextual question based on ai_suggestion
    let question = "";
    let suggestedActions: string[] = ["categorize"];

    if (tx.ai_suggestion === "duplicate" && tx.duplicate_of) {
      // Fetch the original transaction
      const { data: original } = await supabase
        .from("imported_transactions")
        .select("payee, original_amount, transaction_date")
        .eq("id", tx.duplicate_of)
        .single();

      question = `I found two identical transactions here. "${tx.payee}" for ₹${tx.original_amount} appears on ${tx.transaction_date}${original ? ` and ${original.transaction_date}` : ""}. Should I ignore one as a refund, or was this a separate purchase?`;
      suggestedActions = ["categorize", "ignore"];
    } else if (tx.ai_suggestion === "p2p") {
      question = `"${tx.payee}" looks like a personal transfer of ₹${tx.original_amount}. Is this a shared bill you want to split, or a personal payment?`;
      suggestedActions = ["categorize", "adjust_share"];
    } else if (tx.original_amount >= 3000) {
      question = `This is a large expense of ₹${tx.original_amount} at "${tx.payee}". Would you like to split it across multiple categories, or categorize it as one?`;
      suggestedActions = ["categorize", "split"];
    } else if (tx.category_id) {
      question = `I've auto-categorized "${tx.payee}" (₹${tx.original_amount}) based on your previous choices. Does this look right?`;
      suggestedActions = ["categorize"];
    } else {
      question = `How would you like to categorize this ₹${tx.original_amount} transaction at "${tx.payee}"?`;
      suggestedActions = ["categorize"];
    }

    return new Response(JSON.stringify({ question, suggestedActions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-interview error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
