import Stripe from "stripe";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // CORS
    const origin = request.headers.get("Origin") || "*";
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // JSON body
    const body = await request.json();
    const { userId, plan } = body;

    if (!userId || !plan) {
      return new Response(
        JSON.stringify({ ok: false, error: "userId or plan missing" }),
        { status: 400, headers }
      );
    }

    // Stripe 初期化
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });

    // プラン → Price ID
    let priceId;
    if (plan === "bronze") priceId = env.PRICE_BRONZE;
    if (plan === "silver") priceId = env.PRICE_SILVER;
    if (plan === "gold") priceId = env.PRICE_GOLD;

    if (!priceId) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid plan" }),
        { status: 400, headers }
      );
    }

    // Checkout Session 作成（subscription）
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId, // ← price_XXXX であること！！
          quantity: 1,
        },
      ],
      success_url: env.SUCCESS_URL,
      cancel_url: env.CANCEL_URL,
      metadata: {
        userId,
        plan,
      },
      subscription_data: {
        metadata: {
          userId,
          plan,
        },
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        url: session.url,
      }),
      { headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
