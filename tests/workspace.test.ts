import { describe, expect, it } from "vitest";
import { buildTenantHost } from "@/app/workspace/host";

describe("buildTenantHost", () => {
  it("rebrands localhost to <slug>.localhost (preserving port)", () => {
    expect(buildTenantHost("localhost:3000", "demo")).toBe("demo.localhost:3000");
    expect(buildTenantHost("localhost:3001", "demo")).toBe("demo.localhost:3001");
    expect(buildTenantHost("localhost", "demo")).toBe("demo.localhost");
  });

  it("rebrands IPv4 addresses to <slug>.localhost (subdomain workaround)", () => {
    expect(buildTenantHost("127.0.0.1:3000", "demo")).toBe("demo.localhost:3000");
    expect(buildTenantHost("127.0.0.1", "demo")).toBe("demo.localhost");
  });

  it("composes <slug>.<host> for production-style hostnames", () => {
    expect(buildTenantHost("churchplatform.com", "demo")).toBe("demo.churchplatform.com");
    expect(buildTenantHost("staging.churchplatform.com", "demo")).toBe(
      "demo.staging.churchplatform.com",
    );
  });

  it("strips a leading www. before composing", () => {
    expect(buildTenantHost("www.churchplatform.com", "demo")).toBe("demo.churchplatform.com");
  });

  it("preserves port for production-style hostnames", () => {
    expect(buildTenantHost("churchplatform.com:8080", "demo")).toBe("demo.churchplatform.com:8080");
  });

  it("falls back to the platform domain when host is empty", () => {
    expect(buildTenantHost("", "demo")).toMatch(/^demo\./);
  });

  it("is case-insensitive on the input host", () => {
    expect(buildTenantHost("LOCALHOST:3000", "demo")).toBe("demo.localhost:3000");
    expect(buildTenantHost("Churchplatform.com", "demo")).toBe("demo.churchplatform.com");
  });
});
