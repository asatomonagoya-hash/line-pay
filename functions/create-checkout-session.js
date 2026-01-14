import Stripe from "stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://line-pay.pages.dev",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {

  // ✅ OPTIONS（preflight）対応 ← 超重要
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // ✅ JSONで受け取る（LIFF fetch 前提）
    const body = await request.json();
    const lineUserId = body.userId;
    const plan = body.plan; // bronze / silver / gold

    if (!lineUserId || !plan) {
      return new Response(
        JSON.stringify({ error: "userId or plan is missing" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ② plan → Stripe Price ID
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
          JSON.stringify({ error: "plan is invalid", plan }),
          { status: 400, headers: corsHeaders }
        );
    }

    // ③ Stripe 初期化
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // ④ Checkout Session 作成（subscription）
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: env.SUCCESS_URL + "?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: env.CANCEL_URL,

      // ★ Make で拾うため必須
      metadata: {
        userId: lineUserId,
        plan,
      },
      subscription_data: {
        metadata: {
          userId: lineUserId,
          plan,
        },
      },
      client_reference_id: lineUserId,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
