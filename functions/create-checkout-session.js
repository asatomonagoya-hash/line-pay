import Stripe from "stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);

    // 受け取り方：GETでもPOSTでもOKにする
    // 例）/create-checkout-session?line_user_id=Uxxx&plan=bronze
    let lineUserId = url.searchParams.get("line_user_id");
    let plan = url.searchParams.get("plan");

    if (request.method === "POST") {
      const ct = request.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await request.json().catch(() => ({}));
        lineUserId = body?.line_user_id ?? body?.userId ?? lineUserId;
        plan = body?.plan ?? plan;
      }
    }

    // バリデーション：LINE userId
    if (!lineUserId || typeof lineUserId !== "string" || !lineUserId.startsWith("U") || lineUserId.length < 20) {
      return new Response(JSON.stringify({ error: "line_user_id is required", line_user_id: lineUserId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // バリデーション：plan
    const PRICE_MAP = {
      bronze: env.PRICE_BRONZE,
      silver: env.PRICE_SILVER,
      gold: env.PRICE_GOLD,
    };

    if (!plan || !PRICE_MAP[plan]) {
      return new Response(JSON.stringify({ error: "plan is invalid", plan }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (!env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Missing env: STRIPE_SECRET_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });

    const priceId = PRICE_MAP[plan];

    // ✅ Checkout Session（subscription）を作る
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],

      // 決済完了後に Make が拾える
      metadata: {
        userId: lineUserId,
        plan,
        priceId,
      },

      // 毎月の invoice.paid でも subscription 経由で拾える（超重要）
      subscription_data: {
        metadata: {
          userId: lineUserId,
          plan,
          priceId,
        },
      },

      success_url: env.SUCCESS_URL || "https://line.me",
      cancel_url: env.CANCEL_URL || "https://line.me",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
}
