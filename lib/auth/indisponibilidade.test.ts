import { describe, expect, it } from "vitest";
import { authTemFalhaTransitoria } from "./indisponibilidade";

describe("indisponibilidade de auth não é logout", () => {
  it.each([429, 500, 502, 503, 504])("reconhece HTTP %i", (status) => {
    expect(authTemFalhaTransitoria({ status })).toBe(true);
  });
  it("reconhece falha de transporte mesmo sem status", () => {
    expect(authTemFalhaTransitoria({ name: "AuthRetryableFetchError" })).toBe(true);
  });
  it.each([400, 401, 403])("não libera sessão inválida HTTP %i", (status) => {
    expect(authTemFalhaTransitoria({ name: "AuthApiError", status })).toBe(false);
  });
  it("sessão ausente segue sendo sessão ausente", () => {
    expect(authTemFalhaTransitoria({ name: "AuthSessionMissingError", status: 400 })).toBe(false);
    expect(authTemFalhaTransitoria(null)).toBe(false);
  });
});
