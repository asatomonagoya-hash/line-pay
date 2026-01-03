export async function onRequest(context) {
  const { env, request } = context;

  const reqUrl = new URL(request.url);
  const lineUserId = reqUrl.searchParams.get("line_user_id");

  if (!lineUserId) {
    return new Response(JSON.stringify({ error: "line_user_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (!env.STRIPE_PAYMENT_LINK_URL) {
    return new Response(
      JSON.stringify({ error: "Missing env: STRIPE_PAYMENT_LINK_URL" }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }

  // Payment Link URL に client_reference_id を付与して返す
  const checkoutUrl = new URL(env.STRIPE_PAYMENT_LINK_URL);
  checkoutUrl.searchParams.set("client_reference_id", lineUserId);

  return new Response(JSON.stringify({ url: checkoutUrl.toString() }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
