"use client";

async function responseError(response: Response) {
  const fallback = "Unable to export the audit trail as a PDF.";
  try {
    const body = await response.json() as { message?: unknown };
    return typeof body.message === "string" && body.message.trim() ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function downloadAuditPdf(endpoint: string, date: string, filenamePrefix: string) {
  const params = new URLSearchParams({ export: "pdf", date });
  const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await responseError(response));

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${filenamePrefix}-${date}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
