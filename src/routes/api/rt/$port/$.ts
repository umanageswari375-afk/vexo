import { createFileRoute } from "@tanstack/react-router";
import { verifyUser } from "@/lib/auth-server";

/**
 * Proxies a project's locally-running dev server through the app origin.
 * This lets a real `http://localhost:PORT` app render inside the sandboxed
 * preview iframe, where the browser cannot reach the host's loopback directly.
 */
export const Route = createFileRoute("/api/rt/$port/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const port = Number(params.port);
        if (!Number.isInteger(port) || port < 1024 || port > 65535)
          return new Response("Bad port", { status: 400 });

        // A signed cookie (set by /api/runtime-ticket) authorises the iframe and
        // all of its asset requests. A `t` param is accepted as a fallback.
        let authed = await verifyUser(request);
        if (!authed) {
          const { readCookie, verifyTicket, COOKIE } = await import("@/lib/runtime-auth.server");
          authed = await verifyTicket(readCookie(request, COOKIE));
        }
        if (!authed) return new Response("Please sign in again.", { status: 401 });

        const url = new URL(request.url);
        const prefix = `/api/rt/${port}`;
        url.searchParams.delete("t");
        const rest = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "/";
        const target = `http://127.0.0.1:${port}${rest || "/"}${url.search}`;

        let upstream: Response;
        try {
          upstream = await fetch(target, {
            headers: { accept: request.headers.get("accept") ?? "*/*" },
            signal: AbortSignal.timeout(20000),
          });
        } catch {
          return new Response("The project server is not reachable.", { status: 502 });
        }

        const ctype = upstream.headers.get("content-type") ?? "";
        const headers = new Headers();
        headers.set("content-type", ctype || "application/octet-stream");
        headers.set("cache-control", "no-store");

        if (!ctype.includes("text/html")) {
          return new Response(upstream.body, { status: upstream.status, headers });
        }

        // Rewrite the document so root-relative assets resolve through the proxy.
        // A <base> tag does not affect URLs that already start with "/", so those
        // are rewritten explicitly; everything else is covered by <base>.
        let html = await upstream.text();
        html = /<head[^>]*>/i.test(html)
          ? html.replace(/<head[^>]*>/i, (h) => `${h}<base href="${prefix}/">`)
          : `<base href="${prefix}/">` + html;
        html = html.replace(
          /(\s(?:src|href)=["'])\/(?!\/|api\/rt)([^"']*)/gi,
          (_m, pre: string, path: string) => `${pre}${prefix}/${path}`,
        );
        html = html.replace(
          /(\s(?:src|href)=)\/(?!\/|api\/rt)([^\s>"']+)/gi,
          (_m, pre: string, path: string) => `${pre}${prefix}/${path}`,
        );
        return new Response(html, { status: upstream.status, headers });
      },
    },
  },
});
