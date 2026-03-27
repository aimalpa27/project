import { json, requireUser, setCors, supabaseAdmin, toInt } from "./_lib.js";

async function getProfile(userId) {
  const rows = await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  return Array.isArray(rows) ? rows[0] || null : null;
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

    if (!profile) {
      return json(res, 400, { error: "Profile not found." });
    }

    if (action === "list") {
      if (profile.role !== "admin") {
        return json(res, 403, { error: "Admin access required." });
      }

      const promos = await supabaseAdmin("promo_codes?select=code,credits,max_uses,used_count,active&order=created_at.desc");
      return json(res, 200, { promos: Array.isArray(promos) ? promos : [] });
    }

    if (action === "create") {
      if (profile.role !== "admin") {
        return json(res, 403, { error: "Admin access required." });
      }

      const code = String(req.body?.code || "").trim().toUpperCase();
      const credits = Math.max(1, toInt(req.body?.credits, 0));
      const maxUses = Math.max(1, toInt(req.body?.maxUses, 0));

      if (!code || !credits || !maxUses) {
        return json(res, 400, { error: "Code, credits and maxUses are required." });
      }

      const rows = await supabaseAdmin("promo_codes", {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify([{
          code,
          credits,
          max_uses: maxUses,
          used_count: 0,
          active: true,
          created_by: user.id,
        }]),
      });

      return json(res, 200, { promo: Array.isArray(rows) ? rows[0] : rows });
    }

    if (action === "redeem") {
      const code = String(req.body?.code || "").trim().toUpperCase();
      if (!code) {
        return json(res, 400, { error: "Promo code is required." });
      }

      const promos = await supabaseAdmin(`promo_codes?code=eq.${encodeURIComponent(code)}&select=*`);
      const promo = Array.isArray(promos) ? promos[0] || null : null;

      if (!promo || !promo.active) {
        return json(res, 404, { error: "Промокод не найден или выключен." });
      }

      if (Number(promo.used_count || 0) >= Number(promo.max_uses || 0)) {
        return json(res, 400, { error: "У промокода закончились активации." });
      }

      const usedRows = await supabaseAdmin(`promo_redemptions?promo_code_id=eq.${promo.id}&user_id=eq.${encodeURIComponent(user.id)}&select=id`);
      if (Array.isArray(usedRows) && usedRows.length > 0) {
        return json(res, 400, { error: "Этот пользователь уже активировал данный промокод." });
      }

      await supabaseAdmin("promo_redemptions", {
        method: "POST",
        body: JSON.stringify([{
          promo_code_id: promo.id,
          user_id: user.id,
        }]),
      });

      await supabaseAdmin(`promo_codes?id=eq.${promo.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          used_count: Number(promo.used_count || 0) + 1,
        }),
      });

      const updatedProfileRows = await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          credits: Number(profile.credits || 0) + Number(promo.credits || 0),
        }),
      });

      return json(res, 200, {
        addedCredits: Number(promo.credits || 0),
        profile: Array.isArray(updatedProfileRows) ? updatedProfileRows[0] : updatedProfileRows,
      });
    }

    return json(res, 400, { error: "Invalid action." });
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Promo error.",
    });
  }
}
