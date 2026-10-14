import path from "node:path";
import type { Runner } from "../tools/run.ts";

/** H.264 720p CRF 23 + AAC, faststart. Used when a video is larger than MAX_VIDEO_MB. */
export async function transcodeVideo(run: Runner, input: string, signal?: AbortSignal): Promise<string> {
  const output = path.join(path.dirname(input), `${path.basename(input, path.extname(input))}.720p.mp4`);
  await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-vf",
      "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      output,
    ],
    { timeoutMs: 30 * 60_000, ...(signal ? { signal } : {}) },
  );
  return output;
}

/** One frame at `atSeconds` as JPEG bytes. */
export async function videoFrame(run: Runner, input: string, atSeconds: number): Promise<Buffer> {
  const { stdout } = await run(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-ss", atSeconds.toFixed(2), "-i", input, "-frames:v", "1", "-vf", "scale=960:-2", "-f", "image2", "-c:v", "mjpeg", "pipe:1"],
    { timeoutMs: 2 * 60_000, maxStdoutBytes: 32 * 1024 * 1024 },
  );
  if (stdout.length === 0) throw new Error("ffmpeg produced no frame");
  return stdout;
}
