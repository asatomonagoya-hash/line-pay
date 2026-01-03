// functions/create-checkout-session.js
// Cloudflare Pages Functions
// GET /create-checkout-session?line_user_id=Uxxxxxxxx
// -> creates Stripe Checkout Session (using payment_link) with:
//    metadata.line_user_id = U...
//    client_reference_id   = U...
// -> redirects to session.url

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const reqUrl = new URL(request.url);

    // Accept both "line_user_id" and "lineUserId" just in case
    const lineUserId =
      reqUrl.searchParams.get("line_user_id") ||
      reqUrl.searchParams.get("lineUserId");

    if (!lineUserId || !lineUserId.startsWith("U")) {
      return text("invalid line_user_id (should start with 'U')", 400);
    }

    if (!env.STRIPE_SECRET_KEY) {
      return text("missing STRIPE_SECRET_KEY env", 500);
    }
    if (!env.STRIPE_PAYMENT_LINK_ID) {
      return text("missing STRIPE_PAYMENT_LINK_ID env", 500);
    }

    // Fallback URLs (change if you want)
    const successUrl =
      env.SUCCESS_URL ?? "https://line.me/R/ti/p/@117dkbgg?paid=1";
    const cancelUrl =
      env.CANCEL_URL ?? "https://line.me/R/ti/p/@117dkbgg";

    // Build Checkout Session payload
    // Important: payment_link is supported for Checkout Sessions API
    const payload = {
      mode: "payment",
      payment_link: env.STRIPE_PAYMENT_LINK_ID,

      // ✅ Make/Stripe webhook will definitely include these:
      client_reference_id: lineUserId,
      metadata: {
        line_user_id: lineUserId,
      },

      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    // Stripe expects application/x-www-form-urlencoded for v1 endpoints
    const formBody = new URLSearchParams(flattenForStripe(payload)).toString();

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    const json = await safeJson(resp);

    if (!resp.ok) {
      // Return Stripe error as JSON for debugging
      return new Response(JSON.stringify(json, null, 2), {
        status: resp.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (!json?.url) {
      return new Response(JSON.stringify(json, null, 2), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Redirect user to Stripe Checkout hosted URL
    return Response.redirect(json.url, 302);
  } catch (err) {
    return text(`server error: ${String(err?.message ?? err)}`, 500);
  }
}

/**
 * Flatten nested object into Stripe-style form fields.
 * Example:
 *  { metadata: { a: "b" } } -> { "metadata[a]": "b" }
 */
function flattenForStripe(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === null || v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;

    if (Array.isArray(v)) {
      v.forEach((item, idx) => {
        const arrKey = `${key}[${idx}]`;
        if (item === null || item === undefined) return;

        if (typeof item === "object" && !Array.isArray(item)) {
          flattenForStripe(item, arrKey, out);
        } else {
          out[arrKey] = String(item);
        }
      });
      continue;
    }

    if (typeof v === "object") {
      flattenForStripe(v, key, out);
      continue;
    }

    out[key] = String(v);
  }
  return out;
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return { error: { message: "Non-JSON response from Stripe" } };
  }
}

function text(message, status = 200) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
