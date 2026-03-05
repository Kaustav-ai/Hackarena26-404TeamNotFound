import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push utilities
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function importVapidKey(base64Key: string): Promise<CryptoKey> {
  const keyData = urlBase64ToUint8Array(base64Key);
  return await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function createJWT(
  audience: string,
  subject: string,
  vapidPrivateKey: string,
  vapidPublicKey: string
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const unsignedToken = `${headerB64}.${payloadB64}`;
  const key = await importVapidKey(vapidPrivateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(unsignedToken)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsignedToken}.${sigB64}`;
}

async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;

    const jwt = await createJWT(
      audience,
      "mailto:noreply@luminafinance.app",
      vapidPrivateKey,
      vapidPublicKey
    );

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
        TTL: "86400",
      },
      body: payload,
    });

    return response.ok || response.status === 201;
  } catch (error) {
    console.error("Push send error:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find users inactive for 12+ hours who have push subscriptions enabled
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: inactiveUsers, error: queryError } = await supabase
      .from("profiles")
      .select("user_id, display_name, daily_budget, last_active_at")
      .lt("last_active_at", twelveHoursAgo);

    if (queryError) {
      console.error("Query error:", queryError);
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!inactiveUsers || inactiveUsers.length === 0) {
      return new Response(JSON.stringify({ message: "No inactive users", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = inactiveUsers.map((u) => u.user_id);

    // Fetch subscriptions for these users
    const { data: subscriptions } = await supabase
      .from("user_subscriptions")
      .select("user_id, subscription")
      .in("user_id", userIds)
      .eq("enabled", true);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions found", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check today's spending for personalized messages
    const today = new Date().toISOString().split("T")[0];
    let sentCount = 0;

    for (const sub of subscriptions) {
      const user = inactiveUsers.find((u) => u.user_id === sub.user_id);
      if (!user) continue;

      const name = user.display_name || "there";

      // Check their spending today
      const { data: todayTxns } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", sub.user_id)
        .eq("type", "expense")
        .gte("transaction_date", today);

      const todaySpent = todayTxns?.reduce((sum, t) => sum + t.amount, 0) ?? 0;
      const budget = user.daily_budget || 2000;
      const ratio = todaySpent / budget;

      let body: string;
      if (todaySpent === 0) {
        body = `Hey ${name}, it looks like you forgot to track your expenses today. Track them now to stay on budget! 💰`;
      } else if (ratio > 0.8) {
        body = `Hey ${name}, you're close to your daily limit! Log today's spends to see where you stand. ⚠️`;
      } else {
        body = `You've been consistent, ${name}! Just one more check-in to finish today's streak. 🔥`;
      }

      const payload = JSON.stringify({
        title: "Lumina Finance",
        body,
        url: "/",
      });

      const success = await sendPushNotification(
        sub.subscription as any,
        payload,
        vapidPublicKey,
        vapidPrivateKey
      );

      if (success) sentCount++;
    }

    return new Response(
      JSON.stringify({ message: `Sent ${sentCount} reminders`, sent: sentCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
