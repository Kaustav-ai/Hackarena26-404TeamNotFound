import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  
  if (!vapidPublicKey) {
    return new Response(JSON.stringify({ error: "VAPID key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ publicKey: vapidPublicKey }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
