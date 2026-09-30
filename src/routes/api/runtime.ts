import { createFileRoute } from "@tanstack/react-router";
import { verifyUser } from "@/lib/auth-server";
import type { FileMap } from "@/lib/projects";

type Body = {
  projectId?: string;
  action?: "run" | "install" | "stop" | "status";
  script?: string;
  files?: FileMap;
};

function frame(type: string, data: unknown) {
  return JSON.stringify({ type, data }) + "\n";
}

export const Route = createFileRoute("/api/runtime")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await verifyUser(request)))
          return new Response("Please sign in again.", { status: 401 });

        const body = (await request.json()) as Body;
        const id = body.projectId ?? "";
        if (!id) return new Response("Missing projectId", { status: 400 });

        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (type: string, data: unknown) =>
              controller.enqueue(enc.encode(frame(type, data)));
            try {
              const rt = await import("@/lib/runtime.server");
              if (!(await rt.runtimeAvailable())) {
                send("unavailable", {
                  message:
                    "Real execution needs the Node runtime. Run the app with `npm run dev` locally to use real npm install and live server links.",
                });
                controller.close();
                return;
              }
              if (body.action === "install") {
                const res = await rt.installDeps(id, body.files ?? {}, (line) =>
                  send("log", { line }),
                );
                send("result", res);
              } else if (body.action === "stop") {
                rt.stopSession(id);
                send("result", { ok: true, available: true, sessions: [], online: true, logs: [] });
              } else if (body.action === "status") {
                send("result", {
                  ok: true,
                  available: true,
                  online: true,
                  logs: [],
                  sessions: rt.listSessions(id),
                });
              } else {
                const res = await rt.runProject(
                  id,
                  body.files ?? {},
                  body.script ?? "dev",
                  (line) => send("log", { line }),
                );
                send("result", res);
              }
            } catch (e) {
              send("error", { message: (e as Error).message });
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});

export type { FileMap };
