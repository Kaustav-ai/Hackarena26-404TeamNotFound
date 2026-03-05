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
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { importId } = body;
    // Support single filePath or multiple filePaths
    const allPaths: string[] = body.filePaths || (body.filePath ? [body.filePath] : []);

    if (!importId || allPaths.length === 0) {
      return new Response(JSON.stringify({ error: "Missing importId or filePath(s)" }), { status: 400, headers: corsHeaders });
    }

    await supabase.from("statement_imports").update({ status: "processing" }).eq("id", importId);

    // Download all files and build content parts
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };

    const userContent: any[] = [];

    for (const fp of allPaths) {
      const { data: fileData, error: fileError } = await supabase.storage.from("statements").download(fp);
      if (fileError || !fileData) {
        console.error("Failed to download:", fp, fileError);
        continue;
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const ext = fp.split(".").pop()?.toLowerCase() || "";
      const mimeType = mimeMap[ext] || "application/pdf";
      const isImage = mimeType.startsWith("image/");

      if (isImage) {
        userContent.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } });
      } else {
        userContent.push({ type: "file", file: { filename: "statement.pdf", file_data: `data:application/pdf;base64,${base64}` } });
      }
    }

    if (userContent.length === 0) {
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "Failed to download files" }), { status: 500, headers: corsHeaders });
    }

    userContent.push({
      type: "text",
      text: `Parse all transactions from ${allPaths.length > 1 ? "these screenshots/statements" : "this statement/screenshot"}. Extract every transaction with payee, amount, date, and type. Do not duplicate transactions that appear across multiple screenshots.`
    });

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });
    }

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content: `You are a financial statement parser. Extract all transactions from the provided bank/UPI statement(s) (PDF or screenshots). For each transaction, extract: payee name, amount (positive number), date (YYYY-MM-DD format), and type (income or expense). Debits/payments/sent/paid to = expense. Credits/received from = income. Be thorough and extract every single transaction. If dates are relative like "5 minutes ago" or "2 hours ago", use today's date. If multiple screenshots are provided, combine all unique transactions without duplicates.`
          },
          {
            role: "user",
            content: userContent
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_transactions",
              description: "Extract structured transaction data from a bank statement",
              parameters: {
                type: "object",
                properties: {
                  transactions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        payee: { type: "string", description: "Name of the payee/merchant" },
                        amount: { type: "number", description: "Transaction amount as positive number" },
                        date: { type: "string", description: "Transaction date in YYYY-MM-DD format" },
                        type: { type: "string", enum: ["income", "expense"], description: "Whether this is income or expense" }
                      },
                      required: ["payee", "amount", "date", "type"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["transactions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_transactions" } }
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), { status: 429, headers: corsHeaders });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required for AI processing." }), { status: 402, headers: corsHeaders });
      }
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "AI parsing failed" }), { status: 500, headers: corsHeaders });
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), { status: 500, headers: corsHeaders });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const transactions = parsed.transactions || [];

    if (transactions.length === 0) {
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "No transactions found in statement" }), { status: 400, headers: corsHeaders });
    }

    const [{ data: rules }, { data: profileData }] = await Promise.all([
      supabase.from("mapping_rules").select("*").eq("user_id", userId),
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    const autoIgnoreLimit = Number((profileData as any)?.auto_ignore_limit) || 0;

    const txRows = transactions.map((t: any) => {
      let categoryId = null;
      if (rules) {
        const matchedRule = rules.find((r: any) =>
          t.payee.toLowerCase().includes(r.payee_pattern.toLowerCase())
        );
        if (matchedRule) categoryId = matchedRule.category_id;
      }

      const amount = Math.abs(t.amount);
      const shouldAutoIgnore = autoIgnoreLimit > 0 && amount <= autoIgnoreLimit;

      return {
        user_id: userId,
        import_id: importId,
        payee: t.payee,
        original_amount: amount,
        adjusted_amount: amount,
        type: t.type,
        category_id: categoryId,
        transaction_date: t.date,
        is_ignored: shouldAutoIgnore,
        is_reviewed: shouldAutoIgnore,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("imported_transactions")
      .insert(txRows)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "Failed to save transactions" }), { status: 500, headers: corsHeaders });
    }

    if (inserted) {
      for (let i = 0; i < inserted.length; i++) {
        for (let j = i + 1; j < inserted.length; j++) {
          const a = inserted[i];
          const b = inserted[j];
          if (
            a.payee.toLowerCase() === b.payee.toLowerCase() &&
            a.original_amount === b.original_amount
          ) {
            const dateA = new Date(a.transaction_date).getTime();
            const dateB = new Date(b.transaction_date).getTime();
            if (Math.abs(dateA - dateB) <= 86400000) {
              await supabase
                .from("imported_transactions")
                .update({ duplicate_of: a.id, ai_suggestion: "duplicate" })
                .eq("id", b.id);
            }
          }
        }
      }

      const businessWords = ["amazon", "flipkart", "swiggy", "zomato", "uber", "ola", "paytm", "phonepe", "google", "apple", "netflix", "spotify", "jio", "airtel", "vodafone", "hdfc", "icici", "sbi", "axis", "kotak", "wholesale", "mart", "store", "shop", "restaurant", "cafe", "hotel", "hospital", "pharmacy", "petrol", "gas", "electric", "water", "insurance", "rent", "emi", "loan"];
      for (const tx of inserted) {
        if (tx.ai_suggestion) continue;
        const payeeLower = tx.payee.toLowerCase();
        const isBusinessy = businessWords.some(w => payeeLower.includes(w));
        if (!isBusinessy && tx.payee.split(/\s+/).length <= 3) {
          await supabase
            .from("imported_transactions")
            .update({ ai_suggestion: "p2p" })
            .eq("id", tx.id);
        }
      }
    }

    const autoIgnoredCount = txRows.filter((t: any) => t.is_ignored).length;

    await supabase
      .from("statement_imports")
      .update({
        status: "ready",
        total_transactions: inserted?.length || 0,
        reviewed_count: autoIgnoredCount,
      })
      .eq("id", importId);

    return new Response(JSON.stringify({ success: true, count: inserted?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-statement error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
