export async function hmacSha256Base64(keyBytes, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
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

export async function createRelaySasToken(uri, keyName, key) {
  const encodedUri = encodeURIComponent(uri.toLowerCase());
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = await hmacSha256Base64(new TextEncoder().encode(key), `${encodedUri}\n${expiry}`);
  return `SharedAccessSignature sr=${encodedUri}&sig=${encodeURIComponent(sig)}&se=${expiry}&skn=${keyName}`;
}

export function parseAcsConnectionString(connStr) {
  const endpointMatch = connStr.match(/endpoint=([^;]+)/i);
  const keyMatch = connStr.match(/accesskey=([^;]+)/i);
  if (!endpointMatch || !keyMatch) throw new Error("Invalid ACS Connection String");
  return { endpoint: endpointMatch[1].replace(/\/$/, ""), accessKey: keyMatch[1] };
}

export function parseRelayConnectionString(connStr) {
  const endpointMatch = connStr.match(/Endpoint=sb:\/\/([^/;]+)\/?/i);
  const keyNameMatch = connStr.match(/SharedAccessKeyName=([^;]+)/i);
  const keyMatch = connStr.match(/SharedAccessKey=([^;]+)/i);
  const entityMatch = connStr.match(/EntityPath=([^;]+)/i);

  if (!endpointMatch || !keyNameMatch || !keyMatch || !entityMatch) {
    throw new Error("Invalid Relay Connection String");
  }

  return {
    ns: endpointMatch[1],
    keyName: keyNameMatch[1],
    key: keyMatch[1],
    entity: entityMatch[1]
  };
}

