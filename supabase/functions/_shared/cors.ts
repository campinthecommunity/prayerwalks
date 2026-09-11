// Shared CORS headers for every Edge Function the dashboard calls from the
// browser. The site is meant to be reachable by anyone, so this allows any
// origin -- these functions don't return anything sensitive (moderation
// verdicts, generated prayer content, or a plain success/failure for an
// admin action that is itself re-authenticated inside the function).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
