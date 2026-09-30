import { createFileRoute } from "@tanstack/react-router";
import { verifyUser } from "@/lib/auth-server";
import { fetchImage } from "@/lib/images.server";

export const Route = createFileRoute("/api/fetch-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await verifyUser(request)))
          return new Response("Please sign in again.", { status: 401 });
        let body: { query?: string; width?: number; height?: number };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Invalid request body.", { status: 400 });
        }
        const clamp = (v: unknown, d: number) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 2000) : d;
        };
        const img = await fetchImage(
          (body.query ?? "").toString().slice(0, 120),
          clamp(body.width, 800),
          clamp(body.height, 600),
        );
        return Response.json(img, {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
