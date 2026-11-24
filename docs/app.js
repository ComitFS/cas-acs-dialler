import { hmacSha256Base64, sha256Base64, base64ToBytes, parseAcsConnectionString } from "./crypto.js";

const FIELDS = ["acsConnStr", "cognitiveEndpoint", "sourcePhone", "targetPhone", "playMode", "ttsVoice", "playPayload"];
const API_VERSION = "2024-09-15";
const val = (id) => document.getElementById(id).value.trim();

let activeCallId = null;

function log(msg) {
  const el = document.getElementById("log");
  el.textContent += `[${new Date().toISOString().split("T").slice(0, 8)}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function setCallButtons(inCall) {
  document.getElementById("btnPlay").disabled = !inCall;
  document.getElementById("btnHangup").disabled = !inCall;
}

window.addEventListener("DOMContentLoaded", () => {
  FIELDS.forEach(id => {
    const saved = localStorage.getItem("acs_tester_" + id);
    if (saved !== null) document.getElementById(id).value = saved;
    document.getElementById(id).addEventListener("input", e => {
      localStorage.setItem("acs_tester_" + id, e.target.value);
    });
  });
});

document.getElementById("btnClear").onclick = () => {
  FIELDS.forEach(id => localStorage.removeItem("acs_tester_" + id));
  location.reload();
};

async function acsRequest(method, pathAndQuery, bodyObj) {
  const { endpoint, accessKey } = parseAcsConnectionString(val("acsConnStr"));
  const url = `${endpoint}${pathAndQuery}`;
  const urlObj = new URL(url);
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "";
  const utcDate = new Date().toUTCString();
  const contentHash = await sha256Base64(bodyStr);

  const stringToSign = `${method}\n${urlObj.pathname}${urlObj.search}\n${utcDate};${urlObj.host};${contentHash}`;
  const signature = await hmacSha256Base64(base64ToBytes(accessKey), stringToSign);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-ms-date": utcDate,
      "x-ms-content-sha256": contentHash,
      "Authorization": `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`
    },
    body: bodyObj ? bodyStr : undefined
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`ACS HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

document.getElementById("btnCall").onclick = async () => {
  try {
    const targetPhone = val("targetPhone");
    const cogEndpoint = val("cognitiveEndpoint");
    const payload = {
      targets: [{ rawId: `4:${targetPhone}`, phoneNumber: { value: targetPhone } }],
      sourceCallerIdNumber: { value: val("sourcePhone") },
      callbackUri: "https://example.com",
      ...(cogEndpoint && {
        callIntelligenceOptions: {
          cognitiveServicesEndpoint: cogEndpoint
        }
      })
    };
    log(`Initiating outbound PSTN call to ${targetPhone}...`);
    const res = await acsRequest("POST", `/calling/callConnections?api-version=${API_VERSION}`, payload);
    activeCallId = res.callConnectionId;
    setCallButtons(true);
    log(`Call created! Answer the phone, then click Play. ID: ${activeCallId}`);
  } catch (e) {
    log(`CreateCall failed: ${e.message}`);
  }
};

document.getElementById("btnPlay").onclick = async () => {
  if (!activeCallId) return;
  try {
    const mode = val("playMode");
    const playSource = mode === "tts"
      ? { kind: "text", text: { text: val("playPayload"), voiceName: val("ttsVoice") } }
      : { kind: "file", file: { uri: val("playPayload") } };

    log(`Playing ${mode.toUpperCase()} into call ${activeCallId}...`);
    await acsRequest("POST", `/calling/callConnections/${activeCallId}:play?api-version=${API_VERSION}`, {
      playSources: [playSource],
      playTo: []
    });
    log(`Play command accepted by ACS.`);
  } catch (e) {
    log(`Play failed: ${e.message}`);
  }
};

document.getElementById("btnHangup").onclick = async () => {
  if (!activeCallId) return;
  try {
    log(`Terminating call ${activeCallId}...`);
    await acsRequest("POST", `/calling/callConnections/${activeCallId}:terminate?api-version=${API_VERSION}`, null);
    log(`Call terminated.`);
    activeCallId = null;
    setCallButtons(false);
  } catch (e) {
    log(`Hangup failed: ${e.message}`);
  }
};
