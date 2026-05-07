export const URGENT_NVTS = [
  "2V8031", "2V8032", "2V8033", "2V8034",
] as const;

export const PRIORITY_NVTS = [
  "2V8002", "2V8004", "2V8005", "2V8006", "2V8007",
  "2V8008", "2V8009", "2V8014", "2V8015", "2V8016",
] as const;

const URGENT_SET = new Set<string>(URGENT_NVTS);
const PRIO_SET = new Set<string>(PRIORITY_NVTS);

export const isUrgentNvt = (nvt: string | null | undefined): boolean =>
  !!nvt && URGENT_SET.has(nvt);

/** True for both urgent (highest) and regular priority NVTs. */
export const isPriorityNvt = (nvt: string | null | undefined): boolean =>
  !!nvt && (URGENT_SET.has(nvt) || PRIO_SET.has(nvt));
