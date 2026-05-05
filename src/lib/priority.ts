export const PRIORITY_NVTS = [
  "2V8002", "2V8004", "2V8005", "2V8006", "2V8007",
  "2V8008", "2V8009", "2V8014", "2V8015", "2V8016",
] as const;

const SET = new Set<string>(PRIORITY_NVTS);
export const isPriorityNvt = (nvt: string | null | undefined): boolean =>
  !!nvt && SET.has(nvt);
