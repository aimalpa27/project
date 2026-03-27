const REQUIRED_PUBLIC_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

export function json(res, status, body) {
  res.status(status).json(body);
}

export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function ensurePublicConfig() {
  for (const key of REQUIRED_PUBLIC_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key} environment variable.`);
    }
  }
}

export function getPublicConfig() {
  ensurePublicConfig();
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    appUrl: process.env.APP_URL || "",
  };
}

export async function requireUser(req) {
  ensurePublicConfig();

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new Error("Missing access token.");
  }

  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.id) {
    throw new Error(payload?.msg || payload?.error_description || "Invalid session.");
  }

  return payload;
}

export function requireAdminEnv() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }
}

export async function supabaseAdmin(path, init = {}) {
  ensurePublicConfig();
  requireAdminEnv();

  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const details = payload?.message || payload?.error || payload?.hint || response.statusText;
    throw new Error(typeof details === "string" ? details : "Supabase request failed.");
  }

  return payload;
}

export function makeProfile(user, existing) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const email = String(user.email || "").trim().toLowerCase();
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || existing?.full_name || "";

  return {
    id: user.id,
    email,
    full_name: fullName,
    role: email && adminEmail && email === adminEmail ? "admin" : existing?.role || "user",
    credits: Number(existing?.credits || 0),
  };
}

export function packConfig(pack) {
  const table = {
    starter: {
      credits: 5,
      priceId: process.env.STRIPE_PRICE_ID_STARTER,
    },
    plus: {
      credits: 20,
      priceId: process.env.STRIPE_PRICE_ID_PLUS,
    },
    pro: {
      credits: 50,
      priceId: process.env.STRIPE_PRICE_ID_PRO,
    },
  };

  return table[pack] || null;
}

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
