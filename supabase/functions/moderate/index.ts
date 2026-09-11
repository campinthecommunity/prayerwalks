// Supabase Edge Function: moderate
//
// Runs a lightweight AI content check on a piece of submitted text, or on a
// photo, before it goes into the shared database. This exists because the
// dashboard is a public, all-ages, no-login site -- anyone with the link can
// post a pin, a reflection, or a photo, and everyone else sees it. This check
// is best-effort, not a hard security boundary: it deters careless or
// opportunistic misuse, but someone could still bypass it (e.g. by calling
// the database directly with the public anon key). The admin "Manage
// Content" panel in the dashboard is the backstop for anything that slips
// through.
//
// On ANY failure here (missing API key, network error, bad response, rate
// limit) this returns { flagged: false } -- i.e. it fails OPEN. A moderation
// outage should never be the reason an ordinary church member can't log a
// prayer walk.
//
// Requires the ANTHROPIC_API_KEY secret (Project Settings -> Edge Functions
// -> Secrets, or `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`).
// Optional ANTHROPIC_MODEL secret to override the default model.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.warn("ANTHROPIC_API_KEY not set -- moderation disabled, failing open.");
      return jsonResponse({ flagged: false });
    }

    const body = await req.json().catch(() => null);
    if (!body || (body.type !== "text" && body.type !== "image")) {
      return jsonResponse({ error: "Expected { type: 'text', label, text } or { type: 'image', imageBase64 }" }, 400);
    }

    const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;
    let messageContent: unknown;

    if (body.type === "text") {
      const text = String(body.text || "").trim();
      if (!text) return jsonResponse({ flagged: false });
      const label = String(body.label || "submission");

      const prompt = `You are a content moderator for a public United Methodist church prayer-walk website. Members submit short text (a place name, a church name, a written reflection) that is shown publicly to anyone with the link, all ages included.

Review the ${label} below. Flag it ONLY if it contains sexual or lewd content, hate speech or slurs, harassment or threats, or other content clearly inappropriate for a public, all-ages faith-community website. Do not flag ordinary church/place names, mild frustration, or sincere religious reflection, even if emotional or about a difficult topic.

Text to review:
"""
${text.slice(0, 4000)}
"""

Reply with ONLY JSON: {"flagged": boolean, "reason": "short reason if flagged, else empty string"}`;

      messageContent = [{ type: "text", text: prompt }];
      return await callAnthropic(apiKey, model, messageContent);
    }

    // type === "image"
    const imageBase64: string = String(body.imageBase64 || "");
    const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return jsonResponse({ flagged: false }); // can't parse -- fail open rather than block

    const [, mediaType, base64Data] = match;
    const prompt = `You are a content moderator for a public United Methodist church prayer-walk website. This photo is being added to a public, all-ages photo gallery of community prayer walks.

Flag it ONLY if it contains nudity or sexual content, graphic violence or gore, hate symbols, or other content clearly inappropriate for a public, all-ages faith-community website. Do NOT flag ordinary photos of people, groups, buildings, streets, or nature -- that is the expected content for this gallery.

Reply with ONLY JSON: {"flagged": boolean, "reason": "short reason if flagged, else empty string"}`;

    messageContent = [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
      { type: "text", text: prompt },
    ];
    return await callAnthropic(apiKey, model, messageContent);
  } catch (error) {
    console.error("moderate function error, failing open:", error);
    return jsonResponse({ flagged: false });
  }
});

async function callAnthropic(apiKey: string, model: string, content: unknown): Promise<Response> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic API error:", res.status, await res.text().catch(() => ""));
      return jsonResponse({ flagged: false });
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return jsonResponse({ flagged: false });

    const parsed = JSON.parse(jsonMatch[0]);
    return jsonResponse({ flagged: !!parsed.flagged, reason: parsed.reason || "" });
  } catch (error) {
    console.error("Anthropic call failed, failing open:", error);
    return jsonResponse({ flagged: false });
  }
}
