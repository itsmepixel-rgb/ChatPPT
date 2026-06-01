const curatedPool = [
  {
    id: "fallback_maps",
    keywords: "historical maps chart geography atlas timeline cartography vintage diagram",
    description: "Historical Maps and Timeline Charts",
    urlId: "photo-1524661135-423995f22d0b",
    photographer: "Curated Commons"
  },
  {
    id: "fallback_business",
    keywords: "business analytics chart finance growth presentation dashboard graph",
    description: "Business Analytics and Growth Charts",
    urlId: "photo-1460925895917-afdab827c52f",
    photographer: "Carlos Muza"
  },
  {
    id: "fallback_science",
    keywords: "science research laboratory medical biology chemistry microscope",
    description: "Scientific Research Laboratory",
    urlId: "photo-1532187863486-abf9d39d66e8",
    photographer: "Ousa Chea"
  },
  {
    id: "fallback_education",
    keywords: "education learning book library academic school study",
    description: "Education and Academic Study",
    urlId: "photo-1497633762265-9d179a990aa6",
    photographer: "Kimberly Farmer"
  },
  {
    id: "fallback_technology",
    keywords: "technology computer code software cyber network ai data",
    description: "Technology and Software Research",
    urlId: "photo-1518770660439-4636190af475",
    photographer: "Alexandre Debieve"
  },
  {
    id: "fallback_design",
    keywords: "design infographic illustration diagram layout creative abstract",
    description: "Creative Infographic Design",
    urlId: "photo-1579546929518-9e396f3cc809",
    photographer: "Design Grid"
  }
];

function fallbackResults(query: string) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = curatedPool.filter((item) =>
    queryWords.some((word) =>
      item.keywords.includes(word) || item.description.toLowerCase().includes(word)
    )
  );
  const pool = matched.length ? matched : curatedPool;

  return pool.map((img) => {
    const cleanUrlId = img.urlId.startsWith("photo-") ? img.urlId.substring(6) : img.urlId;
    return {
      id: img.id,
      description: img.description,
      urls: {
        regular: `https://images.unsplash.com/photo-${cleanUrlId}?auto=format&fit=crop&w=800&q=80`,
        small: `https://images.unsplash.com/photo-${cleanUrlId}?auto=format&fit=crop&w=400&q=80`,
        thumb: `https://images.unsplash.com/photo-${cleanUrlId}?auto=format&fit=crop&w=150&q=80`
      },
      user: { name: img.photographer }
    };
  });
}

export const config = {
  maxDuration: 20,
};

export default async function handler(req: any, res: any) {
  try {
    const query = String(req.query?.q || "").trim();
    if (!query) return res.status(200).json({ results: [] });

    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=800&format=json&origin=*`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "ChatPPTApp/1.0 VercelFunction"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return res.status(200).json({ results: fallbackResults(query) });
    }

    const data = await response.json();
    const pages = data?.query?.pages || {};
    const results = Object.keys(pages).flatMap((key) => {
      const page = pages[key];
      const imageinfo = page.imageinfo?.[0];
      if (!imageinfo?.url) return [];

      const title = page.title
        ? page.title.replace(/^File:/i, "").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ")
        : "Wikimedia Image";
      const author = imageinfo.extmetadata?.Artist?.value
        ? imageinfo.extmetadata.Artist.value.replace(/<\/?[^>]+(>|$)/g, "").trim()
        : "Wikimedia Commons";

      return [{
        id: `wikimedia_${page.pageid || key}`,
        description: title,
        urls: {
          regular: imageinfo.url,
          small: imageinfo.thumburl || imageinfo.url,
          thumb: imageinfo.thumburl || imageinfo.url
        },
        user: { name: author || "Wikimedia Commons" }
      }];
    });

    return res.status(200).json({ results: results.length ? results : fallbackResults(query) });
  } catch (error: any) {
    return res.status(200).json({ results: fallbackResults(String(req.query?.q || "")), warning: error?.message || "Image search fallback used" });
  }
}
