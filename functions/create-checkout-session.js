export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 例: /create-checkout-session?line_user_id=Uxxxx
  const lineUserId = url.searchParams.get("line_user_id");

  if (!lineUserId || !lineUserId.startsWith("U")) {
    return new Response("invalid line_user_id", { status: 400 });
  }

  // 既存のPayment Link（あなたのJSONに出ていた plink）
  const paymentLinkId = env.STRIPE_PAYMENT_LINK_ID; // 例: plink_1ShlBMJtferJfFFTYyM0eb6l
  if (!paymentLinkId) {
    return new Response("missing STRIPE_PAYMENT_LINK_ID", { status: 500 });
  }

  // Stripe Checkout Session作成（Stripe APIにサーバー側からPOST）
  const body = {
    mode: "payment",
    payment_link: paymentLinkId,

    // ★ここが肝：Makeで確実に取れるように埋める
    metadata: { line_user_id: lineUserId },

    // 任意（使いたいなら）
    client_reference_id: lineUserId,

    // 任意：戻り先（必要なら env にしてもOK）
    success_url: env.SUCCESS_URL ?? "https://line.me/R/ti/p/@117dkbgg?paid=1",
    cancel_url: env.CANCEL_URL ?? "https://line.me/R/ti/p/@117dkbgg"
  };

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(flattenForStripe(body)).toString()
  });

  const json = await resp.json();

  if (!resp.ok) {
    return new Response(JSON.stringify(json, null, 2), {
      status: resp.status,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Stripeの hosted checkout URLへリダイレクト
  return Response.redirect(json.url, 302);
}

// Stripeのx-www-form-urlencoded用にネストを潰す
function flattenForStripe(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      v.forEach((item, idx) => {
        if (typeof item === "object") flattenForStripe(item, `${key}[${idx}]`, out);
        else out[`${key}[${idx}]`] = String(item);
      });
    } else if (typeof v === "object") {
      flattenForStripe(v, key, out);
    } else {
      out[key] = String(v);
    }
  }
  return out;
}
