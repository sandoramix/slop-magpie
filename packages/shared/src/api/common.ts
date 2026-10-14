import { z } from "zod";

export const IdParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof IdParam>;

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");

/** Emoji or icon name; short free text. */
export const Icon = z.string().trim().min(1).max(64);

export const Name = z.string().trim().min(1).max(200);

export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;
