export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = 'r8_7P128uXt0QqnsghBhX9Xk7osr5nK88640i6Ct';
  const { action, id } = req.query;

  try {
    if (action === 'create') {
      const { prompt } = req.body;
      const r = await fetch('https://api.replicate.com/v1/models/minimax/video-01/predictions', {
        method: 'POST',
        headers: { 'Authorization': `Token ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { prompt, prompt_optimizer: true } })
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }
    if (action === 'status' && id) {
      const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { 'Authorization': `Token ${API_KEY}` }
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }
    return res.status(400).json({ error: 'Invalid' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
