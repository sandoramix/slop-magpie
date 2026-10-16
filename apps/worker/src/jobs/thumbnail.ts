import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { items, media } from "@magpie/db";
import { itemKeys } from "@magpie/storage";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import type { WorkerContext } from "../context.ts";
import { probeVideo } from "../media/probe.ts";
import { makeThumbnail } from "../media/thumbnail.ts";
import { videoFrame } from "../media/transcode.ts";

async function blobToBuffer(ctx: WorkerContext, key: string): Promise<Buffer> {
  const { body } = await ctx.store.get(key);
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Creates missing WebP thumbnails (and fills missing dimensions). Then queues `extract`. */
export async function thumbnailItem(ctx: WorkerContext, itemId: string): Promise<number> {
  const [item] = await ctx.db.select({ id: items.id }).from(items).where(eq(items.id, itemId));
  if (!item) return 0;
  const rows = await ctx.db.select().from(media).where(eq(media.itemId, itemId)).orderBy(asc(media.position));
  let made = 0;
  await mkdir(ctx.tmpDir, { recursive: true });
  const tmpDir = await mkdtemp(path.join(ctx.tmpDir, `thumb-${itemId}-`));
  try {
    for (const m of rows) {
      if (m.thumbKey) continue;
      let source: Buffer;
      const patch: Partial<typeof media.$inferInsert> = {};
      if (m.type === "video") {
        // ffmpeg needs a seekable file (moov atom may be at the end)
        const file = path.join(tmpDir, `${m.position}.video`);
        const { body } = await ctx.store.get(m.storageKey);
        await pipeline(body, createWriteStream(file));
        const info = m.durationMs === null || m.width === null ? await probeVideo(ctx.run, file) : null;
        if (info) {
          if (m.width === null && info.width !== null) patch.width = info.width;
          if (m.height === null && info.height !== null) patch.height = info.height;
          if (m.durationMs === null && info.durationMs !== null) patch.durationMs = info.durationMs;
        }
        const duration = (m.durationMs ?? info?.durationMs ?? 0) / 1000;
        // ~1 s in, or 10% for short clips
        const at = duration > 0 ? Math.min(1, duration * 0.1) : 0;
        source = await videoFrame(ctx.run, file, at).catch(() => videoFrame(ctx.run, file, 0));
      } else {
        source = await blobToBuffer(ctx, m.storageKey);
        if (m.width === null || m.height === null) {
          const meta = await sharp(source).metadata().catch(() => null);
          if (meta?.width && meta.height) {
            const rotated = (meta.orientation ?? 1) >= 5;
            patch.width = rotated ? meta.height : meta.width;
            patch.height = rotated ? meta.width : meta.height;
          }
        }
      }
      const thumb = await makeThumbnail(source);
      const key = itemKeys.thumb(itemId, m.position);
      await ctx.store.put(key, Readable.from([thumb]), { contentType: "image/webp", bytes: thumb.length });
      await ctx.db.update(media).set({ ...patch, thumbKey: key }).where(eq(media.id, m.id));
      made += 1;
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
  await ctx.jobs.sendItemJob("extract", { itemId });
  return made;
}
