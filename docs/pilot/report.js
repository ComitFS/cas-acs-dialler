export function downloadPdfReport(groups) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  let total = 0, answered = 0, timeout = 0, failed = 0, pending = 0;
  const rows = [];

  for (const g of groups) {
    for (const u of g.users) {
      // Include Use Case 1 lines
      for (const l of u.lines) {
        total++;
        if (l.status === "answered") answered++;
        else if (l.status === "timeout") timeout++;
        else if (l.status === "failed") failed++;
        else pending++;

        rows.push([
          g.name,
          `${u.name} (${u.logon})`,
          `Line: ${l.label}`,
          l.number,
          l.status.toUpperCase(),
          l.timestamp || "-",
          l.callId || "-",
          l.outcomeNote || "-"
        ]);
      }
      // Include Use Case 2 personal DDI stress test runs
      for (const h of (u.uc2History || [])) {
        rows.push([
          g.name,
          `${u.name} (${u.logon})`,
          `UC2 Personal DDI #${h.attempt}`,
          u.personalDdi || "-",
          h.status.toUpperCase(),
          h.timestamp || "-",
          h.callId || "-",
          h.outcomeNote || "-"
        ]);
      }
    }
  }

  const tested = answered + timeout + failed;
  const passRate = tested ? ((answered / tested) * 100).toFixed(1) : "0.0";

  // Header & Executive Summary
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("Speakerbus to IPC OneView — Migration Call Test Report", 40, 40);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 56);

  doc.autoTable({
    startY: 68,
    head: [["Total Lines", "Tested", "Answered (Pass)", "Timeout", "Failed", "Remaining", "Pass Rate"]],
    body: [[total, tested, answered, timeout, failed, pending, `${passRate}%`]],
    theme: "grid",
    headStyles: { fillColor: "#1e293b", fontSize: 9 },
    bodyStyles: { fontSize: 10, fontStyle: "bold" }
  });

  // Detailed Results Table
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 18,
    head: [["Group", "User (Logon)", "Test / Key Label", "Number", "Status", "Timestamp", "Call Connection ID", "Turret Outcome / Notes"]],
    body: rows,
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: "#2563eb" },
    columnStyles: { 6: { cellWidth: 110 }, 7: { cellWidth: 130 } }
  });


  doc.save(`IPC-OneView-Migration-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
