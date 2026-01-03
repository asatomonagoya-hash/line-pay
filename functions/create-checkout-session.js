import Stripe from "stripe";

export async function onRequest(context) {
  const { env, request } = context;

  const reqUrl = new URL(request.url);
  const lineUserId = reqUrl.searchParams.get("line_user_id");

  if (!lineUserId) {
    return new Response(
      JSON.stringify({ error: "line_user_id is required" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // Payment Link URL を取得
    let paymentLinkUrl = env.STRIPE_PAYMENT_LINK_URL;

    if (!paymentLinkUrl) {
      const pl = await stripe.paymentLinks.retrieve(
        env.STRIPE_PAYMENT_LINK_ID
      );
      paymentLinkUrl = pl.url;
    }

    // client_reference_id に line_user_id を付与
    const checkoutUrl = new URL(paymentLinkUrl);
    checkoutUrl.searchParams.set("client_reference_id", lineUserId);

    return new Response(
      JSON.stringify({
        url: checkoutUrl.toString(),
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to build payment link",
        message: err.message,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
