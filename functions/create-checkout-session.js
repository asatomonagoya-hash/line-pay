import Stripe from "stripe";

/**
 * CORS 設定（LIFF / curl 両対応）
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * JSONレスポンス統一関数
 */
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

export async function onRequest({ request, env }) {
  /**
   * OPTIONS（preflight）対応
   */
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  /**
   * POST 以外拒否
   */
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const userId = body.userId;
  const plan = body.plan;

  /**
   * debug モード（環境変数確認用）
   */
  if (plan === "debug") {
    return jsonResponse({
      SUCCESS_URL: env.SUCCESS_URL,
      CANCEL_URL: env.CANCEL_URL,
      PRICE_BRONZE: env.PRICE_BRONZE ? "set" : "missing",
      PRICE_SILVER: env.PRICE_SILVER ? "set" : "missing",
      PRICE_GOLD: env.PRICE_GOLD ? "set" : "missing",
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ? "set" : "missing",
    });
  }

  if (!userId || !plan) {
    return jsonResponse({ error: "userId or plan is missing" }, 400);
  }

  /**
   * plan → Price ID
   */
  const priceMap = {
    bronze: env.PRICE_BRONZE,
    silver: env.PRICE_SILVER,
    gold: env.PRICE_GOLD,
  };

  const priceId = priceMap[plan];
  if (!priceId) {
    return jsonResponse(
      { error: "plan is invalid or PRICE env missing", plan },
      400
    );
  }

  /**
   * URLチェック（Stripe投入前に落とす）
   */
  try {
    new URL(env.SUCCESS_URL);
    new URL(env.CANCEL_URL);
  } catch {
    return jsonResponse(
      {
        error: "SUCCESS_URL or CANCEL_URL is not a valid absolute URL",
        successUrl: env.SUCCESS_URL,
        cancelUrl: env.CANCEL_URL,
      },
      500
    );
  }

  /**
   * Stripe 初期化
   */
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    /**
     * Checkout Session 作成（subscription）
     */
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: env.CANCEL_URL,

      // Make / Webhook 用
      metadata: { userId, plan },
      subscription_data: {
        metadata: { userId, plan },
      },
      client_reference_id: userId,
    });

    return jsonResponse({
      ok: true,
      url: session.url,
      id: session.id,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: err?.message || String(err),
      },
      500
    );
  }
}
