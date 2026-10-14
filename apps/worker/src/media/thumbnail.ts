import sharp from "sharp";

export const THUMB_WIDTH = 480;

/** WebP thumbnail, 480 px wide (never upscaled), quality 75, EXIF orientation applied. */
export async function makeThumbnail(input: Buffer | string): Promise<Buffer> {
  return sharp(input, { failOn: "none", animated: false })
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}
