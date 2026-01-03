export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);
    const lineUserId = url.searchParams.get("line_user_id");

    if (!lineUserId) {
      return new Response(
        JSON.stringify({ error: "line_user_id is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (!env.STRIPE_PAYMENT_LINK_URL) {
      return new Response(
        JSON.stringify({ error: "Missing env: STRIPE_PAYMENT_LINK_URL" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const checkoutUrl = new URL(env.STRIPE_PAYMENT_LINK_URL);
    checkoutUrl.searchParams.set("client_reference_id", lineUserId);

    return new Response(
      JSON.stringify({ url: checkoutUrl.toString() }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
