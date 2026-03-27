const API_TOKEN = process.env.REPLICATE_API_TOKEN;

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function enhancePrompt(prompt, mode) {
  const cleaned = String(prompt || "").trim();
  if (!cleaned) return "";

  if (mode === "image") {
    return `${cleaned}. Highly detailed, cinematic lighting, rich composition, sharp focus, natural color grading, premium generative art quality.`;
  }

  return `${cleaned}. Cinematic motion, strong scene continuity, dynamic camera movement, rich environmental detail, realistic lighting, polished color grading, premium generative video quality.`;
}

function buildCreateConfig(body) {
  const mode = body.mode === "image" ? "image" : body.mode === "image-to-video" ? "image-to-video" : "video";
  const prompt = String(body.prompt || "").trim();
  const image = typeof body.image === "string" ? body.image : "";
  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "16:9";
  const resolution = body.resolution === "480p" ? "480p" : "720p";
  const duration = Math.min(12, Math.max(3, Number.parseInt(body.duration, 10) || 5));

  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  if (mode === "image-to-video" && !image) {
    throw new Error("Image is required for image-to-video mode.");
  }

  if (mode === "image") {
    return {
      modelPath: "black-forest-labs/flux-schnell",
      payload: {
        input: {
          prompt: enhancePrompt(prompt, mode),
          aspect_ratio: aspectRatio,
          output_format: "jpg",
          output_quality: 90,
          go_fast: true,
          megapixels: "1",
          num_outputs: 1,
        },
      },
    };
  }

  return {
    modelPath: "bytedance/seedance-1-lite",
    payload: {
      input: {
        prompt: enhancePrompt(prompt, mode),
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        fps: 24,
        camera_fixed: false,
        ...(image ? { image } : {}),
      },
    },
  };
}

async function replicateFetch(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details =
      data?.detail ||
      data?.error ||
      data?.title ||
      `Replicate request failed with status ${response.status}`;
    throw new Error(details);
  }

  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!API_TOKEN) {
    return sendJson(res, 500, {
      error: "Missing REPLICATE_API_TOKEN environment variable.",
    });
  }

  const { action, id } = req.query;

  try {
    if (action === "create") {
      const { modelPath, payload } = buildCreateConfig(req.body || {});
      const data = await replicateFetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          ...JSON_HEADERS,
        },
        body: JSON.stringify(payload),
      });

      return sendJson(res, 200, data);
    }

    if (action === "status" && id) {
      const data = await replicateFetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      });

      return sendJson(res, 200, data);
    }

    return sendJson(res, 400, { error: "Invalid action." });
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unknown server error.",
    });
  }
}
