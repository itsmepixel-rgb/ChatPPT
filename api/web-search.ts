type SearchType = "wikipedia" | "google";

function parseBody(req: any) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function fallbackWebResults(query: string) {
  return [{
    title: `${query.charAt(0).toUpperCase() + query.slice(1)} Overview`,
    snippet: `Slide-ready research summary and background context for ${query}.`,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
    facts: [
      `Key introduction to ${query}`,
      "Main concepts, structure, and use cases",
      "Relevant context for presentation slides"
    ]
  }];
}

async function wikipediaSearch(query: string) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
  const response = await fetch(searchUrl, {
    headers: { "User-Agent": "ChatPPTApp/1.0 VercelFunction" },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Wikipedia search query failed");

  const data = await response.json();
  const searchList = data?.query?.search || [];
  const results = [];

  for (const item of searchList.slice(0, 5)) {
    const pageTitle = item.title;
    const detailUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&titles=${encodeURIComponent(pageTitle)}&piprop=original&format=json&origin=*`;
    try {
      const detailRes = await fetch(detailUrl, {
        headers: { "User-Agent": "ChatPPTApp/1.0 VercelFunction" },
        signal: AbortSignal.timeout(8000)
      });
      if (!detailRes.ok) throw new Error("Wikipedia detail query failed");
      const detailData = await detailRes.json();
      const pages = detailData?.query?.pages || {};
      const pageId = Object.keys(pages)[0];
      const page = pageId ? pages[pageId] : null;
      results.push({
        title: page?.title || item.title,
        snippet: page?.extract || String(item.snippet || "").replace(/<\/?[^>]+(>|$)/g, ""),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page?.title || item.title)}`,
        image: page?.original?.source || null
      });
    } catch {
      results.push({
        title: item.title,
        snippet: String(item.snippet || "").replace(/<\/?[^>]+(>|$)/g, ""),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
        image: null
      });
    }
  }

  return results;
}

async function geminiSearch(query: string, apiKey?: string) {
  if (!apiKey) return fallbackWebResults(query);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: "Return strictly a JSON array of 4 real-looking search result objects with title, snippet, url, and facts fields. No markdown."
        }]
      },
      contents: [{
        role: "user",
        parts: [{ text: `Create concise presentation research search results for: ${query}` }]
      }],
      generationConfig: { responseMimeType: "application/json" }
    }),
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) return fallbackWebResults(query);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) && parsed.length ? parsed : fallbackWebResults(query);
  } catch {
    return fallbackWebResults(query);
  }
}

export const config = {
  maxDuration: 20,
};

export default async function handler(req: any, res: any) {
  try {
    const body = parseBody(req);
    const type = String(req.query?.type || body.type || "google").toLowerCase() as SearchType;
    const query = String(req.query?.q || body.q || "").trim();
    if (!query) return res.status(200).json({ results: [] });

    if (type === "wikipedia") {
      const results = await wikipediaSearch(query);
      return res.status(200).json({ type: "wikipedia", results });
    }

    const apiKey = body.aiSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
    const results = await geminiSearch(query, apiKey);
    return res.status(200).json({ type: "google", results });
  } catch (error: any) {
    const body = parseBody(req);
    const query = String(req.query?.q || body.q || "search").trim();
    return res.status(200).json({
      type: String(req.query?.type || body.type || "google"),
      results: fallbackWebResults(query),
      warning: error?.message || "Search fallback used"
    });
  }
}
