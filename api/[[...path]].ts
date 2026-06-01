import imageSearch from "./image-search";
import proxySite from "./proxy-site";
import webSearch from "./web-search";

export const config = {
  maxDuration: 30,
};

export default async function handler(req: any, res: any) {
  if (typeof req.url === "string" && !req.url.startsWith("/api/")) {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }

  const pathname = new URL(req.url || "/", "https://chatppt.local").pathname;
  if (pathname === "/api/image-search") return imageSearch(req, res);
  if (pathname === "/api/web-search") return webSearch(req, res);
  if (pathname === "/api/proxy-site") return proxySite(req, res);

  const { default: app } = await import("../server");
  return app(req, res);
}
