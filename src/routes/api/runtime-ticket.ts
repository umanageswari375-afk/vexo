import { createFileRoute } from "@tanstack/react-router";
import { verifyUser } from "@/lib/auth-server";

/**
 * Exchanges a valid Firebase session for a signed proxy cookie, so the preview
 * iframe can authenticate its own asset requests without custom headers.
 */
export const Route = createFileRoute("/api/runtime-ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await verifyUser(request)))
          return new Response("Please sign in again.", { status: 401 });
        const ticket = request.headers
          .get("authorization")
          ?.replace(/^Bearer\s+/i, "")
          .slice(0, 64);
        try {
          const { issueTicket, ticketCookie } = await import("@/lib/runtime-auth.server");
          const value = await issueTicket(ticket ?? "user");
          return new Response(JSON.stringify({ ok: true }), {
            headers: {
              "content-type": "application/json",
              "set-cookie": ticketCookie(value),
            },
          });
        } catch {
          return new Response("Ticket unavailable on this runtime.", { status: 503 });
        }
      },
    },
  },
});
