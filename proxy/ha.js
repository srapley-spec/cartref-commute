// Home Assistant presence for the evening commute watch (docs/stories/commute-watch.md, "Home Assistant"; Sam, 19 Nov).
// The Worker reads one entity, your `person`, with a long-lived token kept in its secrets (HA_BASE_URL, HA_TOKEN;
// HA_PERSON, default person.sam_rapley). Read-only: it never calls a service or changes anything in Home Assistant.
// Any failure gives null, and the watch falls back to the phone's geofence.

export const HA_TIMEOUT_MS = 8000;
const entityOf = (env) => env.HA_PERSON || "person.sam_rapley";
/** Set up, and set up so it can be read: an https address, a token and a person entity (review, 19 Nov). */
export const haConfigured = (env) => !!(env && env.HA_TOKEN && /^https:\/\//.test(String(env.HA_BASE_URL || "")) && /^person\.[a-z0-9_]+$/.test(entityOf(env)));

export async function haPresence(env, fetchImpl = fetch) {
  if (!haConfigured(env)) return null;
  const entity = entityOf(env);
  try {
    const base = String(env.HA_BASE_URL).replace(/\/+$/, "");
    const r = await fetchImpl(`${base}/api/states/${entity}`, { headers: { Authorization: `Bearer ${env.HA_TOKEN}`, "Content-Type": "application/json" },
      // Never followed: a redirect could carry the token to another address.
      redirect: "manual", signal: AbortSignal.timeout(HA_TIMEOUT_MS) });
    if (!r.ok) return null;
    const j = await r.json();
    // "unknown" / "unavailable": Home Assistant doesn't know either; no reading (review, 19 Nov).
    if (!j || typeof j.state !== "string" || !j.state || j.state === "unknown" || j.state === "unavailable") return null;
    const since = Date.parse(j.last_changed || "");
    return { state: j.state, since: Number.isFinite(since) ? since : null };
  } catch (e) { return null; }
}
