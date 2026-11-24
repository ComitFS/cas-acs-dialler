function extractGroup(userGroupsStr) {
  if (!userGroupsStr) return "Unassigned Group";
  const parts = userGroupsStr.split(";").map(s => s.trim()).filter(Boolean);
  return parts.find(p => !/cloudbase/i.test(p)) || parts.at(0) || "Unassigned Group";
}

function parseLabelParts(rawLabel) {
  const beforeSlash = String(rawLabel || "").split("/").at(0).trim();
  const extMatch = beforeSlash.match(/(\d{3,5})\s*$/);
  const ext = extMatch ? extMatch.at(1) : "";
  const namePart = beforeSlash.replace(/\d+\s*$/, "").trim();
  return { namePart, ext };
}

function matchScore(userFullName, labelName, ext, address) {
  if (!userFullName || !labelName) return 0;
  const uTokens = userFullName.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/);
  const lTokens = labelName.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/);
  if (uTokens.length < 2 || lTokens.length < 2) return 0;

  const uFirst = uTokens.at(0), uLast = uTokens.at(-1);
  const lFirst = lTokens.at(0), lLast = lTokens.at(-1);
  if (uLast !== lLast) return 0;

  let score = 50;
  if (uFirst === lFirst) score += 40;
  else if (uFirst.at(0) === lFirst.at(0)) score += 25;
  if (ext && String(address).endsWith(ext)) score += 15;
  return score;
}

export function parseSpeakerbusJson(rows) {
  const groupsMap = new Map();
  const usersByLogon = new Map();
  const pbxRows = [];

  for (const r of rows) {
    const logon = (r["iTurret Logon Name"] || "").trim();
    const userName = (r["User"] || "").trim();
    if (!logon || !userName) continue;

    const groupName = extractGroup(r["User Group(s)"]);
    if (!groupsMap.has(groupName)) groupsMap.set(groupName, { name: groupName, users: [] });

    if (!usersByLogon.has(logon)) {
      const userObj = {
        logon,
        name: userName,
        group: groupName,
        personalDdi: null,
        personalLabel: null,
        ddiWarning: null,
        lines: [],
        uc2History: []
      };
      usersByLogon.set(logon, userObj);
      groupsMap.get(groupName).users.push(userObj);
    }

    if ((r["Key Type"] || "").trim() === "PBX Appearance") {
      const addr = String(r["Address"] || "").replace(/\D/g, "");
      const label = (r["Key Label"] || "").trim();
      if (!addr) continue;

      pbxRows.push({ logon, label, addr });
      const userObj = usersByLogon.get(logon);
      if (!userObj.lines.some(l => l.number === addr)) {
        userObj.lines.push({
          id: `${logon}_${addr}`,
          number: addr,
          label: label || addr,
          status: "pending",
          callId: "",
          timestamp: "",
          outcomeNote: ""
        });
      }
    }
  }

  for (const user of usersByLogon.values()) {
    const ownRows = pbxRows.filter(r => r.logon === user.logon);
    const candidates = [...ownRows, ...pbxRows];
    let best = { score: 0, addr: null, label: null };

    for (const c of candidates) {
      const { namePart, ext } = parseLabelParts(c.label);
      const s = matchScore(user.name, namePart, ext, c.addr);
      if (s > best.score) best = { score: s, addr: c.addr, label: c.label };
      if (best.score >= 90 && c.logon === user.logon) break;
    }

    if (best.score >= 75) {
      user.personalDdi = best.addr;
      user.personalLabel = best.label;
    } else {
      user.ddiWarning = "Personal DDI could not be matched from PBX Appearances";
    }
  }

  return Array.from(groupsMap.values()).filter(g => g.users.length > 0);
}
