import { parseSpeakerbusJson } from "./parser.js";
import { executeTestCall } from "./acs.js";
import { downloadPdfReport } from "./report.js";

const CFG_IDS = [
  "acsConnStr", "cognitiveEndpoint", "callerMode", "teamsRaOid",
  "sourcePhone", "countryPrefix", "ringTimeout", "playHold",
  "cooldownSec", "ttsVoice", "ttsMessage"
];
const STORAGE_DATA_KEY = "ipc_migration_groups_v1";

let groups = [];
let activeTab = "uc1";
let abortCtrl = null;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(msg) {
  const el = $("log");
  el.textContent += `[${new Date().toTimeString().slice(0, 8)}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function getCfg() {
  return {
    acsConnStr: $("acsConnStr").value.trim(),
    cognitiveEndpoint: $("cognitiveEndpoint").value.trim(),
    callerMode: $("callerMode").value,
    teamsRaOid: $("teamsRaOid").value.trim(),
    sourcePhone: $("sourcePhone").value.trim(),
    countryPrefix: $("countryPrefix").value.trim() || "+1",
    ringTimeout: Number($("ringTimeout").value) || 25,
    playHold: Number($("playHold").value) || 8,
    cooldownSec: Number($("cooldownSec").value) || 6,
    ttsVoice: $("ttsVoice").value.trim(),
    ttsMessage: $("ttsMessage").value.trim()
  };
}

function saveState() {
  localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(groups));
  updateKpis();
}

window.addEventListener("DOMContentLoaded", () => {
  CFG_IDS.forEach(id => {
    const saved = localStorage.getItem("ipc_cfg_" + id);
    if (saved !== null) $(id).value = saved;
    $(id).addEventListener("input", e => localStorage.setItem("ipc_cfg_" + id, e.target.value));
  });

  const savedGroups = localStorage.getItem(STORAGE_DATA_KEY);
  if (savedGroups) {
    groups = JSON.parse(savedGroups);
    populateGroups();
    log("Resumed saved migration test session from localStorage.");
  }
});

$("jsonFile").onchange = async (e) => {
  const file = e.target.files.item(0);
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    groups = parseSpeakerbusJson(Array.isArray(raw) ? raw : [raw]);
    saveState();
    populateGroups();
    log(`Imported ${groups.length} group(s) from ${file.name}.`);
  } catch (err) {
    log(`JSON Import Error: ${err.message}`);
  }
};

$("btnReset").onclick = () => {
  if (!confirm("Clear all imported JSON data and test results from this PC?")) return;
  localStorage.removeItem(STORAGE_DATA_KEY);
  location.reload();
};

$("btnPdf").onclick = () => downloadPdfReport(groups);

$("tabUc1").onclick = () => switchTab("uc1");
$("tabUc2").onclick = () => switchTab("uc2");

function switchTab(tab) {
  activeTab = tab;
  $("tabUc1").classList.toggle("active", tab === "uc1");
  $("tabUc2").classList.toggle("active", tab === "uc2");
  $("uc1Controls").classList.toggle("hidden", tab !== "uc1");
  $("uc2Controls").classList.toggle("hidden", tab !== "uc2");
  renderTable();
}

function populateGroups() {
  $("btnPdf").disabled = groups.length === 0;
  $("selGroup").innerHTML = groups.map((g, i) => `<option value="${i}">${g.name} (${g.users.length} users)</option>`).join("");
  populateUsers();
}

$("selGroup").onchange = populateUsers;
$("selUser").onchange = renderTable;

function populateUsers() {
  const g = groups.at($("selGroup").value);
  if (!g) return;
  $("selUser").innerHTML = g.users.map((u, i) => `<option value="${i}">${u.name} (${u.logon})</option>`).join("");
  renderTable();
}

function renderTable() {
  const g = groups.at($("selGroup").value);
  const u = g?.users.at($("selUser").value);
  updateKpis();
  if (!u) return;

  $("userMeta").innerHTML = u.personalDdi
    ? `<strong>${u.name}</strong> (${u.logon}) • Deduced Personal DDI: <strong>${u.personalDdi}</strong> (${u.personalLabel}) • Total PBX Appearances: <strong>${u.lines.length}</strong>`
    : `<strong>${u.name}</strong> (${u.logon}) • <span style="color:#dc2626;font-weight:600">⚠ ${u.ddiWarning}</span>`;

  const tbody = $("linesBody");
  tbody.innerHTML = "";

  if (activeTab === "uc1") {
    u.lines.forEach((line) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${line.label}</td>
        <td><code>${line.number}</code></td>
        <td><span class="badge st-${line.status}">${line.status}</span></td>
        <td><input type="text" value="${line.outcomeNote || ""}" placeholder="e.g. Both handsets + speaker OK" /></td>
        <td><button class="btn btn-primary btn-sm">Dial</button></td>`;
      tr.querySelector("input").onchange = (e) => { line.outcomeNote = e.target.value; saveState(); };
      tr.querySelector("button").onclick = () => runLines([line]);
      tbody.appendChild(tr);
    });
  } else {
    (u.uc2History || []).forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>Personal DDI Attempt #${item.attempt}</td>
        <td><code>${u.personalDdi || "N/A"}</code></td>
        <td><span class="badge st-${item.status}">${item.status}</span></td>
        <td><input type="text" value="${item.outcomeNote || ""}" placeholder="Handset 1 / Handset 2 / Speaker result" /></td>
        <td>${item.timestamp}</td>`;
      tr.querySelector("input").onchange = (e) => { item.outcomeNote = e.target.value; saveState(); };
      tbody.appendChild(tr);
    });
  }
}

function updateKpis() {
  let total = 0, answered = 0, timeout = 0, failed = 0, pending = 0;
  for (const g of groups) {
    for (const u of g.users) {
      for (const l of u.lines) {
        total++;
        if (l.status === "answered") answered++;
        else if (l.status === "timeout") timeout++;
        else if (l.status === "failed") failed++;
        else pending++;
      }
    }
  }
  $("kpiTotal").textContent = total;
  $("kpiPass").textContent = answered;
  $("kpiTimeout").textContent = timeout;
  $("kpiFail").textContent = failed;
  $("kpiPending").textContent = pending;

  const pct = (n) => total ? `${(n / total) * 100}%` : "0%";
  $("barPass").style.width = pct(answered);
  $("barTimeout").style.width = pct(timeout);
  $("barFail").style.width = pct(failed);
}

function setRunning(running) {
  abortCtrl = running ? new AbortController() : null;
  ["btnRunUser", "btnRunGroup", "btnRunUc2"].forEach(id => $(id).disabled = running);
  ["btnStop", "btnStop2"].forEach(id => $(id).disabled = !running);
}

$("btnStop").onclick = $("btnStop2").onclick = () => { abortCtrl?.abort(); log("Stopping after current action..."); };

async function runLines(lineList) {
  const cfg = getCfg();
  setRunning(true);
  for (let i = 0; i < lineList.length; i++) {
    if (abortCtrl.signal.aborted) break;
    const line = lineList.at(i);
    line.status = "calling";
    renderTable();

    const res = await executeTestCall(cfg, line.number, log, abortCtrl.signal);
    line.status = res.status;
    line.callId = res.callId;
    line.timestamp = new Date().toLocaleTimeString();
    if (!line.outcomeNote) line.outcomeNote = res.detail;
    saveState();
    renderTable();

    if (i < lineList.length - 1 && !abortCtrl.signal.aborted) {
      await sleep(cfg.cooldownSec * 1000);
    }
  }
  setRunning(false);
}

$("btnRunUser").onclick = () => {
  const u = groups.at($("selGroup").value)?.users.at($("selUser").value);
  if (u) runLines(u.lines);
};

$("btnRunGroup").onclick = () => {
  const g = groups.at($("selGroup").value);
  if (g) runLines(g.users.flatMap(u => u.lines));
};

$("btnRunUc2").onclick = async () => {
  const u = groups.at($("selGroup").value)?.users.at($("selUser").value);
  if (!u?.personalDdi) return log("Cannot run Use Case 2: No matched Personal DDI for this user.");
  const count = Number($("uc2Count").value) || 3;
  const cfg = getCfg();
  u.uc2History = u.uc2History || [];
  setRunning(true);

  for (let i = 1; i <= count; i++) {
    if (abortCtrl.signal.aborted) break;
    log(`UC2 Call ${i} of ${count} to ${u.name}'s Personal DDI (${u.personalDdi})...`);
    const res = await executeTestCall(cfg, u.personalDdi, log, abortCtrl.signal);
    u.uc2History.push({
      attempt: u.uc2History.length + 1,
      status: res.status,
      callId: res.callId,
      timestamp: new Date().toLocaleTimeString(),
      outcomeNote: res.detail
    });
    saveState();
    renderTable();

    if (i < count && !abortCtrl.signal.aborted) {
      log(`Waiting ${cfg.cooldownSec}s cooldown before next handset/speaker test call...`);
      await sleep(cfg.cooldownSec * 1000);
    }
  }
  setRunning(false);
};
