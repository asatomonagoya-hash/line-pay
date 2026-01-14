import Stripe from "stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {

  // ✅ OPTIONS（プリフライト）対応 ← これがないとiPhoneで死ぬ
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        { status: 405, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { userId, plan } = body;

    if (!userId || !plan) {
      return new Response(
        JSON.stringify({ ok: false, error: "userId or plan missing" }),
        { status: 400, headers: corsHeaders }
      );
    }

    let priceId;
    switch (plan) {
      case "bronze":
        priceId = env.PRICE_BRONZE;
        break;
      case "silver":
        priceId = env.PRICE_SILVER;
        break;
      case "gold":
        priceId = env.PRICE_GOLD;
        break;
      default:
        return new Response(
          JSON.stringify({ ok: false, error: "invalid plan" }),
          { status: 400, headers: corsHeaders }
        );
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: env.SUCCESS_URL,
      cancel_url: env.CANCEL_URL,
      metadata: { userId, plan },
      subscription_data: {
        metadata: { userId, plan },
      },
    });

    return new Response(
      JSON.stringify({ ok: true, url: session.url }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
