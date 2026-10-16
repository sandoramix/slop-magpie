import type { SourcesResponse } from "@magpie/shared/api";
import { allSources } from "@magpie/shared/sources";
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../deps.ts";

export const sourcesRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>().get("/", async (c) => {
    const counts = await deps.countItemsBySource(c.get("principal").libraryId);
    const body: SourcesResponse = {
      sources: allSources.map((s) => ({
        id: s.id,
        label: s.label,
        hosts: [...s.hosts],
        itemCount: counts.get(s.id) ?? 0,
      })),
    };
    return c.json(body, 200);
  });
