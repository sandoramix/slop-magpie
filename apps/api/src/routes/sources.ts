import type { SourcesResponse } from "@magpie/shared/api";
import { allSources } from "@magpie/shared/sources";
import { Hono } from "hono";
import type { AppDeps } from "../deps.ts";

export const sourcesRoutes = (deps: AppDeps) =>
  new Hono().get("/", async (c) => {
    const counts = await deps.countItemsBySource();
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
