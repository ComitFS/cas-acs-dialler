import { hmacSha256Base64, sha256Base64, base64ToBytes, parseAcsConnectionString, toE164 } from "./crypto.js";

const API_VERSION = "2026-03-12";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function acsRequest(cfg, method, pathAndQuery, bodyObj) {
  const { endpoint, accessKey } = parseAcsConnectionString(cfg.acsConnStr);
  const url = `${endpoint}${pathAndQuery}`;
  const urlObj = new URL(url);
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "";
  const utcDate = new Date().toUTCString();
  const contentHash = await sha256Base64(bodyStr);

  const stringToSign = `${method}\n${urlObj.pathname}${urlObj.search}\n${utcDate};${urlObj.host};${contentHash}`;
  const signature = await hmacSha256Base64(base64ToBytes(accessKey), stringToSign);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...(bodyObj && { "Content-Type": "application/json" }),
          "x-ms-date": utcDate,
          "x-ms-content-sha256": contentHash,
          "Authorization": `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`
        },
        body: bodyObj ? bodyStr : undefined
      });

      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${text}`);
        err.status = res.status;
        throw err;
      }
      return text ? JSON.parse(text) : {};
    } catch (err) {
      const isTransient = !err.status || err.status === 429 || err.status >= 500;
      if (attempt === 1 && isTransient) {
        await sleep(1500);
        continue;
      }
      throw err;
    }
  }
}

export async function executeTestCall(cfg, rawTargetNumber, onLog, abortSignal) {
  const targetE164 = toE164(rawTargetNumber, cfg.countryPrefix);
  const isTpe = cfg.callerMode === "tpe";

  const sourcePayload = isTpe
    ? { teamsAppSource: { appId: cfg.teamsRaOid } }
    : { sourceCallerIdNumber: { value: toE164(cfg.sourcePhone, cfg.countryPrefix) } };

  const payload = {
    targets: [{
      kind: "phoneNumber",
      rawId: `4:${targetE164}`,
      phoneNumber: { value: targetE164 }
    }],
    ...sourcePayload,
    callbackUri: "https://example.com",
    ...(cfg.cognitiveEndpoint && {
      callIntelligenceOptions: { cognitiveServicesEndpoint: cfg.cognitiveEndpoint }
    })
  };

  let callId = "";
  try {
    onLog(`Dialling ${targetE164} via ${isTpe ? "Teams TPE" : "ACS PSTN"}...`);
    const created = await acsRequest(cfg, "POST", `/calling/callConnections?api-version=${API_VERSION}`, payload);
    callId = created.callConnectionId;
    onLog(`Queued (ID: ${callId}). Waiting up to ${cfg.ringTimeout}s for answer...`);

    const deadline = Date.now() + cfg.ringTimeout * 1000;
    let answered = false;

    while (Date.now() < deadline) {
      if (abortSignal?.aborted) break;
      await sleep(2500);
      try {
        const info = await acsRequest(cfg, "GET", `/calling/callConnections/${callId}?api-version=${API_VERSION}`, null);
        if (info.callConnectionState === "connected") {
          answered = true;
          break;
        }
        if (info.callConnectionState === "disconnected") break;
      } catch (pollErr) {
        if (pollErr.status === 404) return { status: "failed", callId, detail: "Rejected / Unreachable (404)" };
        throw pollErr;
      }
    }

    if (!answered) {
      onLog(`No answer within ${cfg.ringTimeout}s. Cancelling call...`);
      await safeTerminate(cfg, callId);
      return { status: "timeout", callId, detail: `No answer (${cfg.ringTimeout}s timeout)` };
    }

    onLog(`Answered! Playing TTS message...`);
    await acsRequest(cfg, "POST", `/calling/callConnections/${callId}:play?api-version=${API_VERSION}`, {
      playSources: [{ kind: "text", text: { text: cfg.ttsMessage, voiceName: cfg.ttsVoice } }],
      playTo: []
    });

    await sleep(cfg.playHold * 1000);
    await safeTerminate(cfg, callId);
    onLog(`Call completed & hung up.`);
    return { status: "answered", callId, detail: "Answered + TTS Played" };
  } catch (err) {
    if (callId) await safeTerminate(cfg, callId);
    onLog(`Call error: ${err.message}`);
    return { status: "failed", callId, detail: err.message.slice(0, 80) };
  }
}

async function safeTerminate(cfg, callId) {
  try {
    await acsRequest(cfg, "POST", `/calling/callConnections/${callId}:terminate?api-version=${API_VERSION}`, null);
  } catch (_) {
    // Ignore 404 if far-end already hung up
  }
}
