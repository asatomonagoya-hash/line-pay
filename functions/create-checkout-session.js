/**
 * Cloudflare Pages Functions
 * Path: /functions/create-checkout-session.js
 *
 * POST https://<your-pages-domain>/create-checkout-session
 * Body: { "userId": "Uxxxxxxxx", "plan": "bronze" }
 *
 * Env (Pages > Settings > Environment variables):
 * - STRIPE_SECRET_KEY
 * - PRICE_BRONZE
 * - PRICE_SILVER
 * - PRICE_GOLD
 * - SUCCESS_URL  (e.g. https://line-pay.pages.dev/success.html)
 * - CANCEL_URL   (e.g. https://line-pay.pages.dev/cancel.html)
 */

export async function onRequest(context) {
  const { request, env } = context;

  // --- CORS ---
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- env check ---
  const required = [
    "STRIPE_SECRET_KEY",
    "PRICE_BRONZE",
    "PRICE_SILVER",
    "PRICE_GOLD",
    "SUCCESS_URL",
    "CANCEL_URL",
  ];
  for (const k of required) {
    if (!env[k]) {
      return new Response(JSON.stringify({ ok: false, error: `Missing env: ${k}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // --- parse body ---
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = String(body.userId || "").trim();
  const plan = String(body.plan || "").trim().toLowerCase();

  if (!userId || !userId.startsWith("U")) {
    return new Response(JSON.stringify({ ok: false, error: "userId is required (LINE userId like 'Uxxxx')" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const priceMap = {
    bronze: env.PRICE_BRONZE,
    silver: env.PRICE_SILVER,
    gold: env.PRICE_GOLD,
  };

  const priceId = priceMap[plan];
  if (!priceId) {
    return new Response(JSON.stringify({ ok: false, error: "plan must be bronze|silver|gold" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- create stripe checkout session (subscription) ---
  // NOTE:
  // metadata.userId を「セッション」と「サブスク(subscription_data.metadata)」の両方に入れる
  // → checkout.session.completed で拾える
  // → invoice.paid などでも subscription から拾える
  const url = "https://api.stripe.com/v1/checkout/sessions";

  const params = new URLSearchParams();

  // required
  params.set("mode", "subscription");
  params.set("success_url", env.SUCCESS_URL);
  params.set("cancel_url", env.CANCEL_URL);

  // line items
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");

  // ★超重要：metadataにuserIdを入れる（ここが今回の肝）
  params.set("metadata[userId]", userId);
  params.set("subscription_data[metadata][userId]", userId);

  // optional: tag plan too
  params.set("metadata[plan]", plan);
  params.set("subscription_data[metadata][plan]", plan);

  // optional: if you want to allow promotion codes etc.
  // params.set("allow_promotion_codes", "true");

  // optional: set locale
  // params.set("locale", "ja");

  const stripeRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const stripeText = await stripeRes.text();
  let stripeJson;
  try {
    stripeJson = JSON.parse(stripeText);
  } catch {
    stripeJson = { raw: stripeText };
  }

  if (!stripeRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Stripe API error", detail: stripeJson }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, url: stripeJson.url }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
