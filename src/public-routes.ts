import type { Express } from "express";
import { listVisible } from "./db.ts";
import { fileForCover } from "./photos.ts";
import { toPublic } from "./present.ts";
import { COPY } from "./schemas.ts";
import { publicSitePage } from "./site.ts";

export function mountPublic(app: Express): void {
  app.get("/api/blog", async (_req, res, next) => {
    try {
      const rows = (await listVisible()).filter((row) => row.slug && row.pillar);
      const featured = rows.find((row) => row.featured) ?? null;
      const page = await publicSitePage("blog");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({
        featured: featured ? toPublic(featured, true) : null,
        posts: rows.filter((row) => row !== featured).map((row) => toPublic(row, false)),
        page,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/blog/:slug", async (req, res, next) => {
    try {
      const slug = String(req.params.slug);
      const rows = (await listVisible()).filter((row) => row.slug && row.pillar);
      const post = rows.find((row) => row.slug === slug);
      if (!post) {
        res.status(404).json({ error: COPY.notFound });
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({
        post: toPublic(post, post.featured),
        more: rows.filter((row) => row.id !== post.id).slice(0, 2).map((row) => toPublic(row, false)),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/uploads/:name", (req, res) => {
    const name = String(req.params.name);
    if (!/^[a-f0-9]{32}\.webp$/.test(name)) {
      res.status(404).json({ error: COPY.notFound });
      return;
    }
    const full = fileForCover(`/api/uploads/${name}`);
    if (!full) {
      res.status(404).json({ error: COPY.notFound });
      return;
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(full, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: COPY.notFound });
    });
  });
}
