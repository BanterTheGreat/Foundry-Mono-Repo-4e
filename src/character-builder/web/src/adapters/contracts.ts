import { decodeCharacterJson, encodeCharacterJson } from "@modern4e/shared";

export type Diagnostic = { code: string; kind: string; message: string };
export type Result<T> = { type: "available"; value: T; diagnostics: Diagnostic[] } | { type: "unavailable"; diagnostics: Diagnostic[] };
export type Character = { id: string; identity: { name: string }; savedAt: string; level: number; [key: string]: unknown };
export type Summary = Pick<Character, "id" | "savedAt" | "level"> & { name: string };
export const available = <T>(value: T): Result<T> => ({ type: "available", value, diagnostics: [] });
/** Distinct codes let presentation distinguish quota, database and asset failures. */
export function failure(code: string, error: unknown): Result<never> {
  return { type: "unavailable", diagnostics: [{ code, kind: "IO_FAILURE", message: error instanceof Error ? error.message : String(error) }] };
}
export const decode = (text: string): Result<Character> => JSON.parse(decodeCharacterJson(text));
export const encode = (document: Character): Result<string> => JSON.parse(encodeCharacterJson(JSON.stringify(document)));
export const summary = (document: Character): Summary => ({ id: document.id, name: document.identity.name, savedAt: document.savedAt, level: document.level });
/** Canonical structural comparison ignores object key order, preserves array order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
