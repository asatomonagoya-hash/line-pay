import Stripe from "stripe";

// ✅ CORS（必要最低限）
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://line-pay.pages.dev",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
  // ✅ OPTIONS（preflight）対応：LIFFで必須
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ✅ POST以外は拒否
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  try {
    // ✅ JSONボディ（LIFF fetch前提）
    const body = await request.json();
    const userId = body.userId;
    const plan = body.plan; // bronze / silver / gold / debug

    // ✅ success/cancel URL（必須）※改行・空白混入を吸収
    const successUrl = (env.SUCCESS_URL || "").trim();
    const cancelUrl = (env.CANCEL_URL || "").trim();

    // ✅ デバッグ：plan=debug で env をそのまま返す（原因特定用）
    if (plan === "debug") {
      return jsonResponse({
        SUCCESS_URL: successUrl,
        CANCEL_URL: cancelUrl,
        PRICE_BRONZE: env.PRICE_BRONZE ? "set" : "missing",
        PRICE_SILVER: env.PRICE_SILVER ? "set" : "missing",
        PRICE_GOLD: env.PRICE_GOLD ? "set" : "missing",
        STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ? "set" : "missing",
      });
    }

    if (!userId || !plan) {
      return jsonResponse({ error: "userId or plan is missing" }, 400);
    }

    // ✅ plan → priceId
    const priceMap = {
      bronze: env.PRICE_BRONZE,
      silver: env.PRICE_SILVER,
      gold: env.PRICE_GOLD,
    };

    const priceId = priceMap[plan];
    if (!priceId) {
      return jsonResponse(
        { error: "plan is invalid or price env missing", plan },
        400
      );
    }

    if (!successUrl || !cancelUrl) {
      return jsonResponse(
        {
          error: "SUCCESS_URL or CANCEL_URL is missing",
          successUrl,
          cancelUrl,
        },
        500
      );
    }

    // ✅ URLとして正しいかを先にチェック（Stripeに投げる前に落とす）
    try {
      new URL(successUrl);
      new URL(cancelUrl);
    } catch (e) {
      return jsonResponse(
        {
          error: "SUCCESS_URL or CANCEL_URL is not a valid absolute URL",
          successUrl,
          cancelUrl,
        },
        500
      );
    }

    // ✅ Stripe 初期化（Workers/Pagesで安定させる）
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ✅ Checkout Session 作成（subscription）
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],

      // ✅ session_id を付けて戻す
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,

      // ✅ Makeで拾うためのmetadata（超重要）
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
      client_reference_id: userId,
    });

    return jsonResponse({ ok: true, url: session.url, id: session.id });
  } catch (err) {
    return jsonResponse({ ok: false, error: err?.message || String(err) }, 500);
  }
}
