// /functions/create-checkout-session.js
import Stripe from "stripe";

export async function onRequest(context) {
  const { env, request } = context;

  const url = new URL(request.url);
  const line_user_id = url.searchParams.get("line_user_id");

  if (!line_user_id) {
    return new Response(JSON.stringify({ error: "line_user_id is required" }, null, 2), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Missing env: STRIPE_SECRET_KEY" }, null, 2), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // ✅ ここは「plink_...」でも「https://buy.stripe.com/...」でもOKにする
  if (!env.STRIPE_PAYMENT_LINK_ID && !env.STRIPE_PAYMENT_LINK_URL) {
    return new Response(
      JSON.stringify(
        { error: "Missing env: STRIPE_PAYMENT_LINK_ID or STRIPE_PAYMENT_LINK_URL" },
        null,
        2
      ),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // 1) Payment Link URLを確定（URL直指定 or plinkから取得）
    let paymentLinkUrl = env.STRIPE_PAYMENT_LINK_URL;
    if (!paymentLinkUrl) {
      const pl = await stripe.paymentLinks.retrieve(env.STRIPE_PAYMENT_LINK_ID);
      paymentLinkUrl = pl.url; // ← ここが buy.stripe.com のURL
    }

    // 2) client_reference_id に line_user_id を入れて返す
    const out = new URL(paymentLinkUrl);
    out.searchParams.set("client_reference_id", line_user_id);

    return new Response(
      JSON.stringify(
        {
          url: out.toString(),
          note: "Open this URL to start checkout. line_user_id is set as client_reference_id.",
        },
        null,
        2
      ),
      { headers: { "content-type": "application/json; charset=utf-8" } }
    );
  } catch (err) {
    const message = err?.raw?.message || err?.message || "Unknown error";
    const type = err?.type || err?.raw?.type;

    return new Response(
      JSON.stringify(
        { error: "Failed to buil
