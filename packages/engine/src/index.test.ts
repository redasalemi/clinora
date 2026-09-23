import { describe, expect, it } from "vitest";
import { ENGINE_PACKAGE_NAME } from "./index";

describe("engine package scaffold", () => {
  it("exports a stable placeholder so the test/typecheck wiring can be verified", () => {
    expect(ENGINE_PACKAGE_NAME).toBe("@clinora/engine");
  });
});
