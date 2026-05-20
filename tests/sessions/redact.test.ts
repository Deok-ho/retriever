import { describe, expect, test } from "vitest";
import { redactSecrets, loadRedactPatterns } from "../../src/sessions/redact.js";

describe("redactSecrets — pattern matches", () => {
  test("masks Anthropic API key", () => {
    const input =
      "my key is sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yzAB";
    const { redacted, counts } = redactSecrets(input);
    expect(redacted).toContain("***REDACTED:anthropic_key***");
    expect(redacted).not.toContain("sk-ant-api03");
    expect(counts.anthropic_key).toBe(1);
  });

  test("masks OpenAI API key (sk-proj)", () => {
    const input = "key: sk-proj-abc123def456ghi789jkl012mno345pqr678stu";
    const { redacted, counts } = redactSecrets(input);
    expect(redacted).toContain("***REDACTED:openai_key***");
    expect(counts.openai_key).toBe(1);
  });

  test("does not double-count sk-ant- as openai_key", () => {
    const input = "sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yzAB";
    const { counts } = redactSecrets(input);
    expect(counts.anthropic_key).toBe(1);
    expect(counts.openai_key).toBeUndefined();
  });

  test("masks GitHub PAT (gho_)", () => {
    const input = "token gho_abc123def456ghi789jkl012mno345pqr678stuvwxyzABCD";
    const { redacted, counts } = redactSecrets(input);
    expect(redacted).toContain("***REDACTED:github_token***");
    expect(counts.github_token).toBe(1);
  });

  test("masks GitHub PAT (ghp_)", () => {
    const input = "token ghp_abc123def456ghi789jkl012mno345pqr678stuvwxyzABCD";
    const { counts } = redactSecrets(input);
    expect(counts.github_token).toBe(1);
  });

  test("masks AWS access key", () => {
    const input = "AWS_ACCESS_KEY_ID = AKIAIOSFODNN7EXAMPLE here";
    const { counts } = redactSecrets(input);
    expect(counts.aws_access_key).toBe(1);
  });

  test("masks Slack bot + user tokens", () => {
    const input = "xoxb-12345-67890-abcdefABCDEF and xoxp-12345-67890-abcdefABCDEF";
    const { counts } = redactSecrets(input);
    expect(counts.slack_token).toBe(2);
  });

  test("masks JWT", () => {
    const input =
      "auth eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const { counts } = redactSecrets(input);
    expect(counts.jwt).toBe(1);
  });

  test("masks postgres URL with credentials", () => {
    const input =
      "DATABASE_URL=postgres://admin:supersecret@db.example.com:5432/mydb";
    const { redacted, counts } = redactSecrets(input);
    expect(redacted).toContain("***REDACTED:postgres_url***");
    expect(counts.postgres_url).toBe(1);
    expect(redacted).not.toContain("supersecret");
  });

  test("masks Bearer token (long opaque)", () => {
    const input =
      "Authorization: Bearer abcdef1234567890abcdef1234567890abcdef1234567890";
    const { counts } = redactSecrets(input);
    expect(counts.bearer_token).toBe(1);
  });

  test("masks .env-style KEY=value with secret-like name", () => {
    const input = "API_KEY=very_secret_value_12345\nOTHER_VAR=abc";
    const { counts } = redactSecrets(input);
    expect(counts.env_assignment ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("does not redact harmless prose", () => {
    const input = "Hello world, just regular text with no secrets in it.";
    const { redacted, counts } = redactSecrets(input);
    expect(redacted).toBe(input);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(0);
  });

  test("does not match short non-secret tokens", () => {
    const input = "git checkout sk-feature";
    const { counts } = redactSecrets(input);
    expect(counts.openai_key).toBeUndefined();
  });

  test("multiple secrets in one input", () => {
    const input =
      "ANTHROPIC=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yzAB " +
      "GITHUB=gho_abc123def456ghi789jkl012mno345pqr678stuvwxyzABCD";
    const { counts } = redactSecrets(input);
    expect(counts.anthropic_key).toBe(1);
    expect(counts.github_token).toBe(1);
  });

  test("respects allowlist regex (skips matching values)", () => {
    const input = "demo key sk-ant-api03-DUMMY1234567890abcdefghijklmnopqrstuvwxyz1234";
    const allowlist = [/sk-ant-api\d{2}-DUMMY[A-Za-z0-9]+/];
    const { redacted, counts } = redactSecrets(input, { allowlist });
    expect(redacted).toContain("DUMMY");
    expect(counts.anthropic_key).toBeUndefined();
  });
});

describe("loadRedactPatterns", () => {
  test("loads patterns from yaml with required fields", () => {
    const patterns = loadRedactPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    const anthropic = patterns.find((p) => p.name === "anthropic_key");
    expect(anthropic).toBeDefined();
    expect(anthropic?.placeholder).toContain("REDACTED");
    expect(anthropic?.regex).toBeTruthy();
  });
});
