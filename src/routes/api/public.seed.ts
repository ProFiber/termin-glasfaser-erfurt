import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// One-shot seed endpoint. Call POST /api/public/seed with { token, contacts: [...] }
// Token guards against accidental triggers. Endpoint is removable after seeding.
export const Route = createFileRoute("/api/public/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null) as
          | { token?: string; contacts?: unknown[] }
          | null;
        if (!body || body.token !== "schmucke-seed-2026") {
          return new Response("Forbidden", { status: 403 });
        }
        if (!Array.isArray(body.contacts)) {
          return new Response("Invalid payload", { status: 400 });
        }
        const { data, error } = await supabaseAdmin.rpc("bulk_import_contacts", {
          payload: body.contacts as never,
        });
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true, count: data });
      },
    },
  },
});
