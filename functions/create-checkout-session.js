import Stripe from "stripe";

// ✅ 許可する Origin（必要なら追加OK）
const ALLOWED_ORIGINS = new Set([
  "https://line-pay.pages.dev",
  "https://liff.line.me",
  "https://access.line.me",
]);

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://line-pay.pages.dev";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function jsonResponse(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}

export async function onRequest({ request, env }) {
  const headers = getCorsHeaders(request);

  // ✅ OPTIONS（preflight）
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method Not Allowed" }, 405, headers);
  }

  try {
    const body = await request.json();
    const userId = body.userId;
    const plan = body.plan; // bronze / silver / gold / debug

    // 改行・空白混入を吸収
    const successUrl = (env.SUCCESS_URL || "").trim();
    const cancelUrl = (env.CANCEL_URL || "").trim();

    // debug
    if (plan === "debug") {
      return jsonResponse(
        {
          SUCCESS_URL: successUrl,
          CANCEL_URL: cancelUrl,
          PRICE_BRONZE: env.PRICE_BRONZE ? "set" : "missing",
          PRICE_SILVER: env.PRICE_SILVER ? "set" : "missing",
          PRICE_GOLD: env.PRICE_GOLD ? "set" : "missing",
          STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ? "set" : "missing",
          ORIGIN: request.headers.get("Origin") || null,
        },
        200,
        headers
      );
    }

    if (!userId || !plan) {
      return jsonResponse({ ok: false, error: "userId or plan is missing" }, 400, headers);
    }

    const priceMap = {
      bronze: env.PRICE_BRONZE,
      silver: env.PRICE_SILVER,
      gold: env.PRICE_GOLD,
    };
    const priceId = priceMap[plan];
    if (!priceId) {
      return jsonResponse({ ok: false, error: "plan is invalid or price env missing", plan }, 400, headers);
    }

    // URL validation
    if (!successUrl || !cancelUrl) {
      return jsonResponse({ ok: false, error: "SUCCESS_URL/CANCEL_URL missing" }, 500, headers);
    }
    new URL(successUrl);
    new URL(cancelUrl);

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
      client_reference_id: userId,
    });

    return jsonResponse({ ok: true, url: session.url, id: session.id }, 200, headers);
  } catch (err) {
    return jsonResponse({ ok: false, error: err?.message || String(err) }, 500, headers);
  }
}
