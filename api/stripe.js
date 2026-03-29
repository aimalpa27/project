import { json, packConfig, requireUser, setCors, supabaseAdmin } from "./_lib.js";

async function getProfile(userId) {
  const rows = await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function stripeRequest(path, init) {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  }

  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = payload?.error?.message || "Stripe request failed.";
    throw new Error(details);
  }

  return payload;
}

function encodeForm(data) {
  const params = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const user = await requireUser(req);
    const profile = await getProfile(user.id);
    const action = req.query.action;

    if (!process.env.APP_URL) {
      return json(res, 500, { error: "Missing APP_URL environment variable." });
    }

    if (action === "create") {
      const pack = String(req.body?.pack || "");
      const config = packConfig(pack);

      if (!config?.priceId) {
        return json(res, 400, { error: "Unknown pack or missing Stripe price ID." });
      }

      const session = await stripeRequest("checkout/sessions", {
        method: "POST",
        body: encodeForm({
          mode: "payment",
          success_url: `${process.env.APP_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.APP_URL}?payment=cancelled`,
          "line_items[0][price]": config.priceId,
          "line_items[0][quantity]": 1,
          client_reference_id: user.id,
          customer_email: user.email || profile?.email || "",
          "metadata[user_id]": user.id,
          "metadata[pack]": pack,
          "metadata[credits]": config.credits,
        }),
      });

      return json(res, 200, { url: session.url });
    }

    if (action === "verify") {
      const sessionId = String(req.query.session_id || "").trim();
      if (!sessionId) {
        return json(res, 400, { error: "Missing session_id." });
      }

      const checkoutSession = await stripeRequest(`checkout/sessions/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (checkoutSession.payment_status !== "paid") {
        return json(res, 400, { error: "Оплата ещё не подтверждена." });
      }

      if (checkoutSession.client_reference_id !== user.id) {
        return json(res, 403, { error: "Эта оплата относится к другому пользователю." });
      }

      const existingPayments = await supabaseAdmin(`payments?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=id`);
      if (!Array.isArray(existingPayments) || existingPayments.length === 0) {
        const addedCredits = Number(checkoutSession.metadata?.credits || 0);

        await supabaseAdmin("payments", {
          method: "POST",
          body: JSON.stringify([{
            stripe_session_id: sessionId,
            user_id: user.id,
            amount_total: Number(checkoutSession.amount_total || 0),
            credits: addedCredits,
            status: checkoutSession.payment_status,
          }]),
        });

        await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            credits: Number(profile?.credits || 0) + addedCredits,
          }),
        });
      }

      const updatedProfileRows = await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(user.id)}&select=*`);
      return json(res, 200, { profile: Array.isArray(updatedProfileRows) ? updatedProfileRows[0] : updatedProfileRows });
    }

    return json(res, 400, { error: "Invalid action." });
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Stripe error.",
    });
  }
}
