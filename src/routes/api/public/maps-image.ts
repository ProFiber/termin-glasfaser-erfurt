import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export const Route = createFileRoute("/api/public/maps-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("type"); // "streetview" | "satellite"
        const address = url.searchParams.get("address");
        const sizeParam = url.searchParams.get("size") ?? "640x360";
        const zoom = url.searchParams.get("zoom") ?? "20";

        if (!type || !address) {
          return new Response("Missing params", { status: 400 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const connKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!lovableKey || !connKey) {
          return new Response("Maps connector not configured", { status: 500 });
        }

        let upstream: string;
        if (type === "streetview") {
          upstream = `${GATEWAY_URL}/maps/api/streetview?size=${encodeURIComponent(
            sizeParam,
          )}&location=${encodeURIComponent(address)}&fov=80&pitch=0&source=outdoor&return_error_code=true`;
        } else if (type === "satellite") {
          upstream = `${GATEWAY_URL}/maps/api/staticmap?size=${encodeURIComponent(
            sizeParam,
          )}&zoom=${encodeURIComponent(zoom)}&maptype=satellite&center=${encodeURIComponent(
            address,
          )}&markers=color:red%7C${encodeURIComponent(address)}`;
        } else {
          return new Response("Unknown type", { status: 400 });
        }

        const res = await fetch(upstream, {
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": connKey,
          },
        });

        if (!res.ok) {
          const body = await res.text();
          return new Response(`Upstream ${res.status}: ${body}`, {
            status: res.status,
          });
        }

        const buf = await res.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
            "Cache-Control": "public, max-age=86400, s-maxage=604800",
          },
        });
      },
    },
  },
});
