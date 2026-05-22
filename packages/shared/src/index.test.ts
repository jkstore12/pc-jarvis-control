import { describe, expect, it } from "vitest";
import { assertVolume, isAllowedCommand, isDangerousCommand } from "./index.js";

describe("command whitelist", () => {
  it("allows only MVP commands", () => {
    expect(isAllowedCommand("status")).toBe(true);
    expect(isAllowedCommand("open_chrome")).toBe(true);
    expect(isAllowedCommand("powershell rm -rf")).toBe(false);
  });

  it("marks power commands as dangerous", () => {
    expect(isDangerousCommand("shutdown")).toBe(true);
    expect(isDangerousCommand("restart")).toBe(true);
    expect(isDangerousCommand("screenshot")).toBe(false);
  });

  it("validates volume bounds", () => {
    expect(assertVolume(49.6)).toBe(50);
    expect(() => assertVolume(101)).toThrow();
    expect(() => assertVolume("80")).toThrow();
  });
});
