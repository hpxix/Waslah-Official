import type { Lead } from "../types"
import type { SheetData } from "write-excel-file/browser"

const columns = [
  ["Name", (lead: Lead) => lead.name],
  ["Phone", (lead: Lead) => lead.phone],
  ["Email", (lead: Lead) => lead.email],
  ["Company", (lead: Lead) => lead.company],
  ["Title", (lead: Lead) => lead.title],
  ["Location", (lead: Lead) => lead.location],
  ["Industry", (lead: Lead) => lead.industry],
  ["Source", (lead: Lead) => lead.source],
  ["Status", (lead: Lead) => lead.status],
  ["Fit score", (lead: Lead) => lead.fitScore],
  ["Qualification reason", (lead: Lead) => lead.qualificationReason],
  ["Website", (lead: Lead) => lead.website],
  ["LinkedIn", (lead: Lead) => lead.linkedinUrl],
  ["Last updated", (lead: Lead) => lead.lastSeenUpdateAt],
  ["Tags", (lead: Lead) => lead.tags.join(", ")],
] as const

function fileBaseName() {
  return `wasla-leads-${new Date().toISOString().slice(0, 10)}`
}

function textValue(value: unknown) {
  return value == null ? "" : String(value)
}

function safeSpreadsheetText(value: unknown) {
  const text = textValue(value)
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function exportLeadsCsv(leads: Lead[]) {
  const rows = [columns.map(([label]) => label), ...leads.map((lead) => columns.map(([, read]) => safeSpreadsheetText(read(lead))))]
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n")
  download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${fileBaseName()}.csv`)
}

export async function exportLeadsXlsx(leads: Lead[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser")
  const header = columns.map(([label]) => ({ value: String(label), fontWeight: "bold" as const, backgroundColor: "E5E7EB" }))
  const rows: SheetData = [header, ...leads.map((lead) => columns.map(([, read]) => ({ value: safeSpreadsheetText(read(lead)), type: String })))]
  await writeXlsxFile(rows, {
    sheet: "Leads",
    columns: [24, 18, 28, 26, 26, 20, 22, 14, 14, 12, 52, 30, 34, 22, 30].map((width) => ({ width })),
    stickyRowsCount: 1,
  }).toFile(`${fileBaseName()}.xlsx`)
}
