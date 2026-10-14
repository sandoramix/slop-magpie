import { describe, expect, it } from "vitest";
import { isPublicIp, parseIPv6 } from "./ip.ts";

describe("parseIPv6", () => {
  it.each([
    ["::", [0, 0, 0, 0, 0, 0, 0, 0]],
    ["::1", [0, 0, 0, 0, 0, 0, 0, 1]],
    ["2001:db8::1", [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]],
    ["::ffff:192.168.1.1", [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]],
    ["1:2:3:4:5:6:7:8", [1, 2, 3, 4, 5, 6, 7, 8]],
  ])("parses %s", (input, expected) => {
    expect(parseIPv6(input)).toEqual(expected);
  });

  it.each(["1:2:3:4:5:6:7", "1::2::3", ":1", "fe80::1%eth0", "12345::", "1.2.3.4", "::ffff:999.1.1.1"])(
    "rejects %s",
    (input) => {
      expect(parseIPv6(input)).toBeNull();
    },
  );
});

describe("isPublicIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "100.100.100.100",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "[::1]",
    "fe80::1",
    "fd00::1",
    "fc00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "2002:c0a8:0101::1",
    "2001:db8::1",
    "2001::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2a03:2880:f12f:83:face:b00c:0:25de", "::ffff:8.8.8.8", "[2606:4700::1111]"])(
    "allows %s",
    (address) => {
      expect(isPublicIp(address)).toBe(true);
    },
  );
});
