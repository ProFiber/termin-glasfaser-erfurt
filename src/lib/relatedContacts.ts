import type { Contact } from "./types";

export type RelationReason = "name" | "mobil" | "festnetz" | "email";

export type Relation = {
  bid: string;
  reasons: RelationReason[];
};

export type RelationIndex = Record<string, Relation[]>;

const SALUTATIONS = /^(herr|frau|hr\.?|fr\.?|dr\.?|prof\.?)\s+/i;

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();
  // strip salutations repeatedly
  while (SALUTATIONS.test(s)) s = s.replace(SALUTATIONS, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.length >= 3 ? s : "";
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("+49")) s = "0" + s.slice(3);
  else if (s.startsWith("0049")) s = "0" + s.slice(4);
  else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/\D/g, "");
  return s.length >= 6 ? s : "";
}

export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.toLowerCase().trim();
  return s.includes("@") ? s : "";
}

export function buildRelationIndex(contacts: Contact[]): RelationIndex {
  const byName: Record<string, string[]> = {};
  const byMobil: Record<string, string[]> = {};
  const byFestnetz: Record<string, string[]> = {};
  const byEmail: Record<string, string[]> = {};

  for (const c of contacts) {
    const n = normalizeName(c.name);
    if (n) (byName[n] ||= []).push(c.bid);
    const m = normalizePhone(c.mobil);
    if (m) (byMobil[m] ||= []).push(c.bid);
    const f = normalizePhone(c.festnetz);
    if (f) (byFestnetz[f] ||= []).push(c.bid);
    const e = normalizeEmail(c.email);
    if (e) (byEmail[e] ||= []).push(c.bid);
  }

  const result: RelationIndex = {};

  const addMatches = (bids: string[], reason: RelationReason) => {
    if (bids.length < 2) return;
    for (const a of bids) {
      for (const b of bids) {
        if (a === b) continue;
        const list = (result[a] ||= []);
        let existing = list.find((r) => r.bid === b);
        if (!existing) {
          existing = { bid: b, reasons: [] };
          list.push(existing);
        }
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      }
    }
  };

  Object.values(byName).forEach((b) => addMatches(b, "name"));
  Object.values(byMobil).forEach((b) => addMatches(b, "mobil"));
  Object.values(byFestnetz).forEach((b) => addMatches(b, "festnetz"));
  Object.values(byEmail).forEach((b) => addMatches(b, "email"));

  return result;
}

export const REASON_LABEL: Record<RelationReason, string> = {
  name: "Name",
  mobil: "Mobil",
  festnetz: "Festnetz",
  email: "E-Mail",
};
