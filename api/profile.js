import { json, makeProfile, requireUser, setCors, supabaseAdmin, toInt } from "./_lib.js";

async function findProfile(userId) {
  const rows = await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function saveProfile(profile) {
  const payload = await supabaseAdmin("profiles?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([profile]),
  });

  return Array.isArray(payload) ? payload[0] || null : null;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const user = await requireUser(req);
    const action = req.query.action;
    const existing = await findProfile(user.id);

    if (action === "ensure") {
      const profile = makeProfile(user, existing);
      if (req.body?.fullName) {
        profile.full_name = String(req.body.fullName).trim();
      }
      const saved = await saveProfile(profile);
      return json(res, 200, { profile: saved });
    }

    if (action === "me") {
      const profile = existing || await saveProfile(makeProfile(user, null));
      return json(res, 200, { profile });
    }

    if (action === "consume-credit") {
      const profile = existing || await saveProfile(makeProfile(user, null));
      const amount = Math.max(1, toInt(req.body?.amount, 1));

      if (Number(profile.credits || 0) < amount) {
        return json(res, 400, { error: "Недостаточно кредитов." });
      }

      const updated = await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          credits: Number(profile.credits || 0) - amount,
        }),
      });

      return json(res, 200, { profile: Array.isArray(updated) ? updated[0] : updated });
    }

    return json(res, 400, { error: "Invalid action." });
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Profile error.",
    });
  }
}
