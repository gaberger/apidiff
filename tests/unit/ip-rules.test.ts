import { describe, expect, test } from "bun:test";
import {
  isAllowedProxyProtocol,
  isBlockedIp,
  isBlockedIPv4,
  isBlockedIPv6,
} from "../../src/core/domain/ip-rules.js";

describe("isBlockedIPv4", () => {
  test.each([
    "10.0.0.1",
    "10.255.255.255",
    "127.0.0.1",
    "127.5.6.7",
    "0.0.0.0",
    "169.254.169.254", // AWS/GCP metadata
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "100.64.0.1", // CGNAT
    "100.127.255.255",
    "224.0.0.1", // multicast
    "239.255.255.255",
    "255.255.255.255",
  ])("blocks %s", (ip) => {
    expect(isBlockedIPv4(ip)).toBe(true);
  });

  test.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.254", // just below RFC1918
    "172.32.0.1",     // just above RFC1918
    "192.167.1.1",    // just below 192.168/16
    "100.63.255.254", // just below CGNAT
    "100.128.0.1",    // just above CGNAT
    "223.255.255.255",// just below multicast
  ])("allows %s", (ip) => {
    expect(isBlockedIPv4(ip)).toBe(false);
  });

  test("blocks malformed input as defense-in-depth", () => {
    expect(isBlockedIPv4("not an ip")).toBe(true);
    expect(isBlockedIPv4("1.2.3")).toBe(true);
    expect(isBlockedIPv4("1.2.3.999")).toBe(true);
    expect(isBlockedIPv4("")).toBe(true);
  });
});

describe("isBlockedIPv6", () => {
  test.each([
    "::1",
    "::",
    "::ffff:0:0",
    "fe80::1",
    "fc00::1",
    "fd00::1",
    "ff02::1",
  ])("blocks %s", (ip) => {
    expect(isBlockedIPv6(ip)).toBe(true);
  });

  test("blocks IPv4-mapped IPv6 pointing at private v4", () => {
    expect(isBlockedIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIPv6("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIPv6("::ffff:10.0.0.1")).toBe(true);
  });

  test("allows IPv4-mapped IPv6 pointing at public v4", () => {
    expect(isBlockedIPv6("::ffff:8.8.8.8")).toBe(false);
  });

  test("allows public global-unicast addresses", () => {
    expect(isBlockedIPv6("2001:4860:4860::8888")).toBe(false); // Google public DNS
    expect(isBlockedIPv6("2606:4700:4700::1111")).toBe(false); // Cloudflare
  });
});

describe("isBlockedIp dispatcher", () => {
  test("delegates v4", () => {
    expect(isBlockedIp(4, "10.0.0.1")).toBe(true);
    expect(isBlockedIp(4, "8.8.8.8")).toBe(false);
  });
  test("delegates v6", () => {
    expect(isBlockedIp(6, "::1")).toBe(true);
    expect(isBlockedIp(6, "2001:4860:4860::8888")).toBe(false);
  });
});

describe("isAllowedProxyProtocol", () => {
  test("permits http/https", () => {
    expect(isAllowedProxyProtocol("http:")).toBe(true);
    expect(isAllowedProxyProtocol("https:")).toBe(true);
  });
  test.each(["file:", "gopher:", "ftp:", "data:", "javascript:", "ws:", "wss:"])("rejects %s", (p) => {
    expect(isAllowedProxyProtocol(p)).toBe(false);
  });
});
