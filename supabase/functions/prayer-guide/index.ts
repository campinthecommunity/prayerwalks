// Supabase Edge Function: prayer-guide
//
// Generates the AI-tailored content for one neighborhood's Prayer Guide PDF:
// ten historically/civically significant nearby places to pray over (three
// tagged with a Discernment/Blessing/Empathy "lens"), and four prayer prompts
// grounded in Wesleyan theology. The dashboard's PDF generator falls back to
// solid generic content if this function is unreachable or returns something
// unusable, so a service hiccup here never blocks someone from getting a PDF.
//
// Requires the ANTHROPIC_API_KEY secret (see the moderate function for how to
// set it). Optional ANTHROPIC_MODEL secret to use a different model than the
// default (a stronger model than the moderation check, since this is
// generating the actual guide content).

import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "AI service not configured" }, 503);
    }

    const body = await req.json().catch(() => null);
    const neighborhood = String(body?.neighborhood || "").trim();
    const city = String(body?.city || "").trim();
    const state = String(body?.state || "").trim();
    const churchName = String(body?.churchName || "").trim();
    if (!neighborhood || !city || !state) {
      return jsonResponse({ error: "neighborhood, city, and state are required" }, 400);
    }

    const prompt = `You are creating a one-page prayer walk guide for a United Methodist congregation, focused on ONE specific neighborhood.

Neighborhood: ${neighborhood}
City: ${city}
State: ${state}
Region context: East Tennessee / North Georgia / Southwest Virginia (Appalachian foothills)
Church requesting this guide: ${churchName}

TASK 1 -- List the 10 most historically or civically significant places, streets, institutions, or landmarks in or near this neighborhood, to give prayer walkers concrete things to pray over. Use real, well-known local history where you are genuinely confident in it. Where you are not confident of a specific verified fact, name a plausible REPRESENTATIVE KIND of significant site instead of inventing a specific fake name or date (for example: "the neighborhood's oldest church," "a historic school," "a former mill or industrial site," "a civil-rights-era landmark," "a site tied to the area's Indigenous or early settler history," "a courthouse or civic building," "a river crossing or rail depot"). Never fabricate a specific name, date, or event you are not confident is real.

For exactly 3 of the 10 places (spread across the list, not consecutive), assign a "lens" of "Discernment", "Blessing", or "Empathy" -- one of each -- picking whichever lens best fits that specific place (Discernment for a place whose community needs aren't obvious at a glance; Blessing for a place full of people to intercede for directly, like a school or business district; Empathy for a place tied to both hardship and joy in the community's story). Leave "lens" as an empty string for the other 7 places.

TASK 2 -- Write 4 prayer prompts grounded specifically in United Methodist / Wesleyan theology. Explicitly draw on distinct Wesleyan concepts -- prevenient grace, justifying grace, sanctifying grace, the means of grace (prayer, scripture, communion, Christian conferencing), social holiness ("no holiness but social holiness"), and/or the Wesleyan Quadrilateral (scripture, tradition, reason, experience). Each prompt should open by naming the concept, then apply it to this specific neighborhood.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "areas": [
    { "name": "short place name (a few words)", "note": "one short sentence connecting it to prayer", "lens": "Discernment" }
    ... exactly 10 of these, "lens" empty string ("") on 7 of them and one each of "Discernment"/"Blessing"/"Empathy" on the other 3 ...
  ],
  "prayers": [ "prompt 1", "prompt 2", "prompt 3", "prompt 4" ]
}`;

    const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic API error:", res.status, await res.text().catch(() => ""));
      return jsonResponse({ error: "AI service returned an error" }, 502);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return jsonResponse({ error: "Could not parse AI response" }, 502);

    const guideData = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(guideData.areas) || !Array.isArray(guideData.prayers)) {
      return jsonResponse({ error: "AI response missing expected fields" }, 502);
    }

    return jsonResponse(guideData);
  } catch (error) {
    console.error("prayer-guide function error:", error);
    return jsonResponse({ error: "Unexpected server error" }, 500);
  }
});
