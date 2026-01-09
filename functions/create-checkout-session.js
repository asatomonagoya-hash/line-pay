import Stripe from "stripe";

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);

    // ① クエリ取得
    const lineUserId = url.searchParams.get("line_user_id");
    const plan = url.searchParams.get("plan"); // bronze / silver / gold

    if (!lineUserId) {
      return new Response(
        JSON.stringify({ error: "line_user_id is required" }),
        { status: 400 }
      );
    }

    // ② plan → Stripe Price ID 変換
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
          { status: 400 }
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
      success_url: env.SUCCESS_URL,
      cancel_url: env.CANCEL_URL,

      // ★ ここが最重要（Makeで拾う）
      metadata: {
        userId: lineUserId,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          userId: lineUserId,
          plan: plan,
        },
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
