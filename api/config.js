import { getPublicConfig, json, setCors } from "./_lib.js";

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    return json(res, 200, getPublicConfig());
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Config error.",
    });
  }
}
