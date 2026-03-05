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

    // Use getUser instead of getClaims for reliable auth
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const { importId, filePath } = await req.json();
    if (!importId || !filePath) {
      return new Response(JSON.stringify({ error: "Missing importId or filePath" }), { status: 400, headers: corsHeaders });
    }

    // Download file
    const { data: fileData, error: fileError } = await supabase.storage.from("statements").download(filePath);
    if (fileError || !fileData) {
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "Failed to download file" }), { status: 500, headers: corsHeaders });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    const ext = filePath.split(".").pop()?.toLowerCase() || "jpg";
    const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
    const mimeType = mimeMap[ext] || "image/jpeg";

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });
    }

    const today = new Date().toISOString().split("T")[0];

    // Try with JSON response mode instead of tool_choice (more reliable with vision)
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
            content: `You are an expert receipt OCR parser. Extract EVERY line item from the receipt photo.
Return a JSON object with this exact structure:
{
  "merchant": "store name",
  "items": [
    { "name": "item name", "amount": 10.99, "quantity": 1 }
  ],
  "total": 50.00,
  "tax": 5.00
}
Rules:
- Use today's date (${today}) for all items.
- All items from a receipt are expenses.
- amount must be a positive number.
- quantity defaults to 1 if not visible.
- Be extremely thorough - capture every single item, tax, tip, discount, and total.
- Return ONLY the JSON object, no other text.`
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: "text", text: "Parse every line item from this receipt. Extract the merchant name and each individual item with its price. Return the result as JSON only." }
            ]
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: corsHeaders });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: corsHeaders });
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "AI parsing failed", details: errText }), { status: 500, headers: corsHeaders });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      console.error("AI returned no content:", JSON.stringify(aiResult));
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "AI did not return data" }), { status: 500, headers: corsHeaders });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error("Failed to parse AI response as JSON:", content);
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
        return new Response(JSON.stringify({ error: "AI returned invalid format" }), { status: 500, headers: corsHeaders });
      }
    }

    const items = parsed.items || [];
    const merchant = parsed.merchant || "Unknown Store";

    if (items.length === 0) {
      await supabase.from("statement_imports").update({ status: "error" }).eq("id", importId);
      return new Response(JSON.stringify({ error: "No items found on receipt" }), { status: 400, headers: corsHeaders });
    }

    // Auto-categorize using mapping rules
    const { data: rules } = await supabase.from("mapping_rules").select("*").eq("user_id", userId);
    const { data: profileData } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    const autoIgnoreLimit = Number((profileData as any)?.auto_ignore_limit) || 0;

    const txRows = items.map((item: any) => {
      const amount = Math.abs(Number(item.amount) || 0);
      let categoryId = null;
      if (rules) {
        const matched = rules.find((r: any) =>
          item.name.toLowerCase().includes(r.payee_pattern.toLowerCase()) ||
          merchant.toLowerCase().includes(r.payee_pattern.toLowerCase())
        );
        if (matched) categoryId = matched.category_id;
      }
      const shouldAutoIgnore = autoIgnoreLimit > 0 && amount <= autoIgnoreLimit;
      return {
        user_id: userId,
        import_id: importId,
        payee: `${item.name} (${merchant})`,
        original_amount: amount,
        adjusted_amount: amount,
        type: "expense",
        category_id: categoryId,
        transaction_date: today,
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
      return new Response(JSON.stringify({ error: "Failed to save items" }), { status: 500, headers: corsHeaders });
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

    return new Response(JSON.stringify({ success: true, count: inserted?.length || 0, merchant }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
