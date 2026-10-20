import { checkFixedIp, parseSubnet } from "@nautix/contracts";
import { describe, expect, it } from "vitest";

describe("fixed IP rules", () => {
  it("parses subnets to their first and last address", () => {
    expect(parseSubnet("172.30.0.0/24")).toEqual({ network: 2887647232, broadcast: 2887647487 });
    expect(parseSubnet("10.1.2.77/24")?.network).toBe(parseSubnet("10.1.2.0/24")?.network);
    for (const bad of [
      "",
      "10.0.0.0",
      "10.0.0.0/31",
      "10.0.0.0/4",
      "x/24",
      "10.0.0.0/24/1",
      "fd00::/64",
    ])
      expect(parseSubnet(bad)).toBeNull();
  });

  it("accepts a free address inside the subnet", () => {
    expect(checkFixedIp("172.30.0.50", "172.30.0.0/24", [])).toBeNull();
    expect(checkFixedIp("172.30.0.2", "172.30.0.0/24", ["172.30.0.3"])).toBeNull();
  });

  it("says why an address is not allowed", () => {
    expect(checkFixedIp("nope", "172.30.0.0/24", [])).toBe("invalid");
    expect(checkFixedIp("172.30.0.5", null, [])).toBe("noSubnet");
    expect(checkFixedIp("172.30.1.5", "172.30.0.0/24", [])).toBe("outsideSubnet");
    expect(checkFixedIp("172.30.0.0", "172.30.0.0/24", [])).toBe("reserved");
    expect(checkFixedIp("172.30.0.255", "172.30.0.0/24", [])).toBe("reserved");
    expect(checkFixedIp("172.30.0.1", "172.30.0.0/24", [])).toBe("gateway");
    expect(checkFixedIp("172.30.0.9", "172.30.0.0/24", ["172.30.0.9"])).toBe("inUse");
  });

  it("works on subnets that are not /24", () => {
    expect(checkFixedIp("10.0.3.10", "10.0.0.0/16", [])).toBeNull();
    expect(checkFixedIp("10.1.0.10", "10.0.0.0/16", [])).toBe("outsideSubnet");
    expect(checkFixedIp("10.0.255.255", "10.0.0.0/16", [])).toBe("reserved");
  });
});
