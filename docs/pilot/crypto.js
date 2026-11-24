export async function hmacSha256Base64(keyBytes, message) {
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function sha256Base64(message) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export function parseAcsConnectionString(connStr) {
  const endpointMatch = connStr.match(/endpoint=([^;]+)/i);
  const keyMatch = connStr.match(/accesskey=([^;]+)/i);
  if (!endpointMatch || !keyMatch) throw new Error("Invalid ACS Connection String");
  return { endpoint: endpointMatch.at(1).replace(/\/$/, ""), accessKey: keyMatch.at(1) };
}

export function toE164(rawNumber, defaultPrefix = "+1") {
  const cleaned = String(rawNumber || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  const prefix = defaultPrefix.startsWith("+") ? defaultPrefix : `+${defaultPrefix}`;
  return `${prefix}${cleaned}`;
}
