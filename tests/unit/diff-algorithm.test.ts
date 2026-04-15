import { describe, expect, test } from "bun:test";
import { computeDiff, enrichDiffWithRenames } from "../../src/core/domain/diff-algorithm.js";
import type { DiffResult } from "../../src/core/domain/types.js";

describe("computeDiff", () => {
  test("detects unchanged fields", () => {
    const results = computeDiff({ name: "Alice" }, { name: "Alice" });
    expect(results).toEqual([
      { type: "unchanged", path: "name", old: "Alice", new: "Alice" },
    ]);
  });

  test("detects removed fields", () => {
    const results = computeDiff({ name: "Alice", age: 30 }, { name: "Alice" });
    const removed = results.filter((r) => r.type === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]!.path).toBe("age");
  });

  test("detects added fields", () => {
    const results = computeDiff({ name: "Alice" }, { name: "Alice", email: "a@b.c" });
    const added = results.filter((r) => r.type === "added");
    expect(added).toHaveLength(1);
    expect(added[0]!.path).toBe("email");
  });

  test("detects value changes", () => {
    const results = computeDiff({ status: "active" }, { status: "inactive" });
    const changed = results.filter((r) => r.type === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.old).toBe("active");
    expect(changed[0]!.new).toBe("inactive");
  });

  test("detects type changes", () => {
    const results = computeDiff({ count: "5" }, { count: 5 });
    const typeChanges = results.filter((r) => r.type === "type-change");
    expect(typeChanges).toHaveLength(1);
    expect(typeChanges[0]!.oldType).toBe("string");
    expect(typeChanges[0]!.newType).toBe("number");
  });

  test("detects renames (same value, different key)", () => {
    const results = computeDiff(
      { billing: "charge_automatically" },
      { collection_method: "charge_automatically" },
    );
    const renamed = results.filter((r) => r.type === "renamed");
    expect(renamed).toHaveLength(1);
    expect(renamed[0]!.path).toBe("billing");
    expect(renamed[0]!.newPath).toBe("collection_method");
  });

  test("detects moves (same leaf name and value, different path)", () => {
    const results = computeDiff(
      { address: { city: "SF" } },
      { location: { city: "SF" } },
    );
    const moved = results.filter((r) => r.type === "moved");
    expect(moved).toHaveLength(1);
    expect(moved[0]!.path).toBe("address.city");
    expect(moved[0]!.newPath).toBe("location.city");
  });

  test("handles nested object changes", () => {
    const results = computeDiff(
      { user: { name: "Alice", role: "admin" } },
      { user: { name: "Alice", role: "member" } },
    );
    const changed = results.filter((r) => r.type === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.path).toBe("user.role");
  });

  test("detects array length changes as type-change", () => {
    const results = computeDiff(
      { tags: ["a", "b"] },
      { tags: ["a", "b", "c"] },
    );
    const typeChanges = results.filter((r) => r.type === "type-change");
    expect(typeChanges).toHaveLength(1);
    expect(typeChanges[0]!.oldType).toBe("array[2]");
    expect(typeChanges[0]!.newType).toBe("array[3]");
  });

  test("detects array content changes as value-changed when same length", () => {
    const results = computeDiff(
      { tags: ["a", "b"] },
      { tags: ["a", "x"] },
    );
    const changed = results.filter((r) => r.type === "changed");
    expect(changed).toHaveLength(1);
  });

  test("handles empty objects as input", () => {
    const results = computeDiff({}, {});
    expect(results).toEqual([]);
  });

  test("handles full Stripe-like response diff", () => {
    const v1 = {
      id: "cus_123",
      object: "customer",
      billing: "charge_automatically",
      sources: { data: [] },
      account_balance: 0,
    };
    const v2 = {
      id: "cus_123",
      object: "customer",
      collection_method: "charge_automatically",
      payment_methods: { data: [] },
      balance: 0,
    };
    const results = computeDiff(v1, v2);
    const types = results.map((r) => r.type);

    expect(types).toContain("unchanged"); // id, object
    expect(types).toContain("renamed");   // billing -> collection_method
  });
});

describe("enrichDiffWithRenames — size limits", () => {
  function makeStructural(removed: string[]): DiffResult[] {
    return removed.map((path) => ({ type: "removed" as const, path, old: "value" }));
  }

  test("exact rename still works regardless of size limits (S05)", () => {
    const fa: Record<string, unknown> = { billing: "auto" };
    const fb: Record<string, unknown> = { collection_method: "auto" };
    const structural = makeStructural(["billing"]);
    const results = enrichDiffWithRenames(structural, fa, fb);
    const renamed = results.filter((r) => r.type === "renamed");
    expect(renamed).toHaveLength(1);
    expect(renamed[0]!.newPath).toBe("collection_method");
  });

  test("removed > 100 → fuzzy rename skipped, stays as removed (S02)", () => {
    const fa: Record<string, unknown> = {};
    const fb: Record<string, unknown> = {};
    const removed = Array.from({ length: 150 }, (_, i) => `old_field_${i}`);
    removed.forEach((k) => { fa[k] = `old_${k}`; fb[k.replace("old_", "new_")] = `different_value_${k}`; });
    const structural = makeStructural(removed);
    const results = enrichDiffWithRenames(structural, fa, fb);
    expect(results.filter((r) => r.type === "renamed")).toHaveLength(0);
    expect(results.filter((r) => r.type === "removed")).toHaveLength(150);
  });

  test("empty specs → empty results (S06)", () => {
    const results = enrichDiffWithRenames([], {}, {});
    expect(results).toEqual([]);
  });

  test("small spec → fuzzy rename runs and finds fuzzy match (S04)", () => {
    const fa: Record<string, unknown> = { user_email: "alice@example.com" };
    const fb: Record<string, unknown> = { userEmail: "alice@example.com" };
    const structural = makeStructural(["user_email"]);
    const results = enrichDiffWithRenames(structural, fa, fb);
    const renamed = results.filter((r) => r.type === "renamed");
    expect(renamed).toHaveLength(1);
  });

  test("signal.aborted=true exits early without error (S07)", () => {
    const fa: Record<string, unknown> = {};
    const fb: Record<string, unknown> = {};
    const removed = Array.from({ length: 200 }, (_, i) => `field_${i}`);
    removed.forEach((k) => { fa[k] = `old_${k}`; fb[`x_${k}`] = `new_${k}`; });
    const structural = makeStructural(removed);
    const ac = new AbortController();
    ac.abort();
    const results = enrichDiffWithRenames(structural, fa, fb, ac.signal);
    expect(Array.isArray(results)).toBe(true);
  });
});
