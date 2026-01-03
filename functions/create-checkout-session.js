// /functions/create-checkout-session.js
import Stripe from "stripe";

/**
 * Cloudflare Pages Functions
 * - GET /functions/create-checkout-session?line_user_id=Uxxxx
 * - Stripe Checkout Session を作成（Payment Link を利用）
 * - metadata と payment_intent_data.metadata に line_user_id を確実に入れる
 * - { url } を JSON で返す
 */
export async function onRequestGet(context) {
  const { env, request } = context;

  // ---- CORS（必要に応じて） ----
  // LINE内ブラウザやフロントから呼ぶ場合に備えて付与（不要なら削除OK）
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Preflight（OPTIONS）
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // ---- 必須Envチェック ----
    const required = [
      "STRIPE_SECRET_KEY",
      "STRIPE_PAYMENT_LINK_ID",
      "SUCCESS_URL",
      "CANCEL_URL",
    ];
    for (const k of required) {
      if (!env[k] || String(env[k]).trim() === "") {
        return json(
          { error: `Missing environment variable: ${k}` },
          500,
          corsHeaders
        );
      }
    }

    // ---- line_user_id 取得（クエリ or JSONボディの両対応）----
    const url = new URL(request.url);
    let line_user_id = url.searchParams.get("line_user_id");

    // GET想定ですが、将来POSTにしても動くように保険
    if (!line_user_id && request.method === "POST") {
      const ct = request.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await request.json().catch(() => null);
        if (body && body.line_user_id) line_user_id = String(body.line_user_id);
      }
    }

    if (!line_user_id) {
      return json(
        { error: "line_user_id is required. e.g. ?line_user_id=Uxxxx" },
        400,
        corsHeaders
      );
    }

    // ---- Stripe 初期化 ----
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // ---- Checkout Session 作成（Payment Linkを利用）----
    const session = await stripe.checkout.sessions.create({
      mode: "payment", // Payment LinkでもOK。明示しておく
      payment_link: env.STRIPE_PAYMENT_LINK_ID,

      // 遷移先
      success_url: env.SUCCESS_URL,
      cancel_url: env.CANCEL_URL,

      // ✅ Makeで拾う本命：Session metadata
      metadata: {
        line_user_id,
      },

      // ✅ 保険：見やすい・参照しやすい（nullでも動くが入れておく）
      client_reference_id: line_user_id,

      // ✅ さらに保険：PaymentIntent側にも入れる（payment_intent.succeeded等でも拾える）
      payment_intent_data: {
        metadata: {
          line_user_id,
        },
      },
    });

    if (!session?.url) {
      return json(
        { error: "Stripe session created but session.url is null" },
        500,
        corsHeaders
      );
    }

    return json(
      {
        url: session.url,
        session_id: session.id,
      },
      200,
      corsHeaders
    );
  } catch (err) {
    // Stripeエラーが分かりやすいように整形
    const message =
      (err && (err.raw?.message || err.message)) || "Unknown error";
    const type = err && (err.type || err.raw?.type);

    return json(
      {
        error: "Failed to create checkout session",
        message,
        type,
      },
      500,
      corsHeaders
    );
  }
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}
