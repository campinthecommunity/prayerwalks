// Supabase Edge Function: admin-action
//
// The ONLY way anything gets deleted from the shared database or photo
// storage. The dashboard's anon key (used by every visitor) has no
// update/delete permission at all -- Row Level Security denies it outright
// (see supabase/migrations/0001_init.sql). This function re-checks the admin
// passphrase itself, independently of whatever the browser's admin panel
// already checked client-side, and only then uses the project's
// service-role key (which bypasses Row Level Security) to perform the
// deletion. That way the real access control lives on the server, not just
// in browser JavaScript that anyone could inspect or skip.
//
// Requires the ADMIN_PASSPHRASE secret -- set it to the SAME passphrase used
// in index.html's ADMIN_PASSPHRASE constant:
//   supabase secrets set ADMIN_PASSPHRASE=CDholston26
// If you ever change the passphrase, update it in BOTH places.
//
// SUPABASE_URL and SUPABASE_SECRET_KEYS are provided automatically to every
// Edge Function by the Supabase runtime -- nothing to configure for those.
// SUPABASE_SECRET_KEYS is a JSON dictionary (Supabase's newer multi-key
// system); this reads its "default" entry, falling back to the older
// single-value SUPABASE_SERVICE_ROLE_KEY for projects still on legacy keys.

import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

function resolveElevatedKey(): string | null {
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysJson) {
    try {
      const keys = JSON.parse(secretKeysJson);
      const value = keys?.default || (keys && typeof keys === "object" ? Object.values(keys)[0] : null);
      if (typeof value === "string" && value) return value;
    } catch (e) {
      console.error("Could not parse SUPABASE_SECRET_KEYS:", e);
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ success: false, error: "Invalid request body" }, 400);

    const expectedPassphrase = Deno.env.get("ADMIN_PASSPHRASE");
    if (!expectedPassphrase) {
      console.error("ADMIN_PASSPHRASE secret is not set on this function.");
      return jsonResponse({ success: false, error: "Admin actions are not configured on the server" }, 503);
    }
    if (body.passphrase !== expectedPassphrase) {
      return jsonResponse({ success: false, error: "Incorrect admin passphrase" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const elevatedKey = resolveElevatedKey();
    if (!elevatedKey) {
      console.error("Could not resolve an elevated Supabase key (checked SUPABASE_SECRET_KEYS and SUPABASE_SERVICE_ROLE_KEY).");
      return jsonResponse({ success: false, error: "Admin actions are not configured on the server" }, 503);
    }
    const supabase = createClient(supabaseUrl, elevatedKey);

    if (body.action === "delete-submission") {
      const id = body.id;
      if (typeof id !== "number") return jsonResponse({ success: false, error: "Missing or invalid id" }, 400);

      // stories.id references locations.id on delete cascade, so deleting the
      // location also removes its linked reflection.
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;

      return jsonResponse({ success: true });
    }

    if (body.action === "delete-photo") {
      const id = body.id;
      if (!id) return jsonResponse({ success: false, error: "Missing id" }, 400);

      if (body.imagePath) {
        const { error: storageError } = await supabase.storage.from("photos").remove([body.imagePath]);
        if (storageError) console.warn("Could not remove storage object (continuing to delete the row):", storageError);
      }

      const { error } = await supabase.from("photos").delete().eq("id", id);
      if (error) throw error;

      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: `Unknown action: ${body.action}` }, 400);
  } catch (error) {
    console.error("admin-action function error:", error);
    return jsonResponse({ success: false, error: "Unexpected server error" }, 500);
  }
});
