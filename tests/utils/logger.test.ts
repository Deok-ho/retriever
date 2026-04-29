import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { logger, setLogLevel, getLogLevel, generateRequestId } from "../../src/utils/logger.js";

describe("logger (Codex 주의급 #7)", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let prevLevel: ReturnType<typeof getLogLevel>;

  beforeEach(() => {
    prevLevel = getLogLevel();
    writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    setLogLevel(prevLevel);
    writeSpy.mockRestore();
  });

  test("emits a single JSON line on stderr with stable shape", () => {
    setLogLevel("info");
    logger.info("hello", { foo: "bar", req_id: "abc12345" });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const arg = writeSpy.mock.calls[0][0] as string;
    expect(arg.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(arg.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(parsed.foo).toBe("bar");
    expect(parsed.req_id).toBe("abc12345");
    expect(typeof parsed.ts).toBe("string");
  });

  test("respects log level — debug below info is dropped", () => {
    setLogLevel("info");
    logger.debug("nope");
    expect(writeSpy).not.toHaveBeenCalled();
    logger.warn("yes");
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  test("Error fields are normalized to {message, stack}", () => {
    setLogLevel("error");
    logger.error("boom", { err: new Error("xyz") });
    const arg = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(arg.trim());
    expect(parsed.err.message).toBe("xyz");
    expect(typeof parsed.err.stack).toBe("string");
  });

  test("generateRequestId returns 16 lowercase hex chars", () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    // and they should be reasonably unique
    const ids = new Set([generateRequestId(), generateRequestId(), generateRequestId()]);
    expect(ids.size).toBe(3);
  });
});
