import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { z } from "zod";
import type { Runner } from "../tools/run.ts";

export interface MediaInfo {
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

const FfprobeOutput = z.object({
  streams: z
    .array(z.looseObject({ codec_type: z.string().optional(), width: z.number().optional(), height: z.number().optional(), tags: z.record(z.string(), z.string()).optional(), side_data_list: z.array(z.looseObject({ rotation: z.number().optional() })).optional() }))
    .default([]),
  format: z.looseObject({ duration: z.string().optional() }).optional(),
});

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

export async function probeVideo(run: Runner, file: string): Promise<Omit<MediaInfo, "bytes">> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { timeoutMs: 60_000 });
    const out = FfprobeOutput.parse(JSON.parse(stdout.toString("utf8")));
    const video = out.streams.find((s) => s.codec_type === "video");
    const duration = Number(out.format?.duration);
    let width = video?.width ?? null;
    let height = video?.height ?? null;
    // phone videos are often stored landscape with a rotation flag
    const rotation = Math.abs(Number(video?.tags?.rotate ?? video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0));
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    return { width, height, durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null };
  } catch {
    return { width: null, height: null, durationMs: null };
  }
}

export async function probeImage(file: string): Promise<Omit<MediaInfo, "bytes">> {
  try {
    const meta = await sharp(file).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    const w = meta.width;
    const h = meta.height;
    return { width: rotated ? h : w, height: rotated ? w : h, durationMs: null };
  } catch {
    return { width: null, height: null, durationMs: null };
  }
}

export async function probeFile(run: Runner, file: string, type: "video" | "image"): Promise<MediaInfo> {
  const { size } = await stat(file);
  const dims = type === "video" ? await probeVideo(run, file) : await probeImage(file);
  return { bytes: size, ...dims };
}
