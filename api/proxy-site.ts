export const config = {
  maxDuration: 20,
};

export default async function handler(req: any, res: any) {
  try {
    let targetUrl = String(req.query?.url || "").trim();
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (!targetUrl) {
      return res.status(200).send(`
        <div style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#111827;color:#f3f4f6;text-align:center;padding:16px;">
          <div>
            <h3 style="color:#6366f1;margin:0 0 8px;">Web Proxy Sandbox</h3>
            <p style="color:#9ca3af;font-size:13px;margin:0;">Enter a URL or search query in the browser bar.</p>
          </div>
        </div>
      `);
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = targetUrl.includes(".") && !targetUrl.includes(" ")
        ? `https://${targetUrl}`
        : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetUrl)}+images`;
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8"
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) throw new Error(`Failed to fetch page: ${response.status}`);

    let bodyText = await response.text();
    const baseTag = `<base href="${targetUrl}">`;
    bodyText = bodyText.includes("<head>")
      ? bodyText.replace("<head>", `<head>${baseTag}`)
      : `${baseTag}${bodyText}`;

    return res.status(200).send(bodyText);
  } catch (error: any) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`
      <div style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#111827;color:#f3f4f6;text-align:center;padding:16px;">
        <div>
          <h3 style="color:#ef4444;margin:0 0 8px;">Could not load this page</h3>
          <p style="color:#9ca3af;font-size:13px;margin:0;">${String(error?.message || "Proxy request failed").replace(/[<>&"]/g, "")}</p>
        </div>
      </div>
    `);
  }
}
