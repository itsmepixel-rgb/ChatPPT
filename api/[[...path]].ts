import app from "../server";

export const config = {
  maxDuration: 30,
};

export default function handler(req: any, res: any) {
  if (typeof req.url === "string" && !req.url.startsWith("/api/")) {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }

  return app(req, res);
}
