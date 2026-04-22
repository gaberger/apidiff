import { describe, it, expect } from "bun:test";
import { ForwardNetworksReleaseNotesAdapter } from "./forward-networks-release-notes-adapter.js";

// Minimal fixture: 3 versions newest-first, each carrying a single-step diff.
const FIXTURE = [
  {
    label: "3.0.0",
    from: "2026-03-01",
    breaking: 1,
    diff: {
      from: "2.1.0",
      to: "3.0.0",
      breakingChanges: { added: [{ title: "BC-1", description: "break 3" }] },
      newOperations: { added: [{ title: "OP-1", description: "new op A" }] },
    },
  },
  {
    label: "2.1.0",
    from: "2026-02-01",
    breaking: 2,
    diff: {
      from: "2.0.0",
      to: "2.1.0",
      breakingChanges: { added: [{ title: "BC-0", description: "break 2.1" }, { title: "BC-0b", description: "break 2.1 second" }] },
      scheduledBreakingChanges: { added: [{ title: "SBC-1", description: "scheduled" }] },
    },
  },
  {
    label: "2.0.0",
    from: "2026-01-01",
    breaking: 0,
    diff: {
      from: "1.9.0",
      to: "2.0.0",
      newModels: { added: [{ title: "M1", description: "a model" }] },
    },
  },
];

describe("ForwardNetworksReleaseNotesAdapter", () => {
  it("advertises slug 'forward-networks'", () => {
    const a = new ForwardNetworksReleaseNotesAdapter(FIXTURE);
    expect(a.slug).toBe("forward-networks");
  });

  it("listVersions returns all input versions newest-first", async () => {
    const a = new ForwardNetworksReleaseNotesAdapter(FIXTURE);
    const vs = await a.listVersions();
    expect(vs.map((v) => v.label)).toEqual(["3.0.0", "2.1.0", "2.0.0"]);
    expect(vs[0]!.year).toBe(2026);
  });

  it("fetchRange aggregates every intermediate single-step diff", async () => {
    const a = new ForwardNetworksReleaseNotesAdapter(FIXTURE);
    const agg = await a.fetchRange("2.0.0", "3.0.0");
    // 3.0.0 carries 1 breaking + 1 newOp; 2.1.0 carries 2 breaking + 1 scheduled.
    // 2.0.0 has newModels but it's the boundary — only diffs at i in [idxNewer, idxOlder)
    // are aggregated (versions[0] + versions[1]), not versions[2].
    expect(agg.breakingChanges.added).toHaveLength(3);
    expect(agg.newOperations.added).toHaveLength(1);
    expect(agg.scheduledBreakingChanges.added).toHaveLength(1);
    expect(agg.newModels.added).toHaveLength(0);
    expect(agg.from).toBe("2.0.0");
    expect(agg.to).toBe("3.0.0");
  });

  it("fetchRange with labels in either order produces the same chronological result", async () => {
    const a = new ForwardNetworksReleaseNotesAdapter(FIXTURE);
    const forward = await a.fetchRange("2.0.0", "3.0.0");
    const reverse = await a.fetchRange("3.0.0", "2.0.0");
    expect(reverse.from).toBe("2.0.0");
    expect(reverse.to).toBe("3.0.0");
    expect(reverse.breakingChanges.added).toHaveLength(forward.breakingChanges.added.length);
  });

  it("fetchRange for identical labels returns an empty diff", async () => {
    const a = new ForwardNetworksReleaseNotesAdapter(FIXTURE);
    const agg = await a.fetchRange("2.1.0", "2.1.0");
    expect(agg.breakingChanges.added).toHaveLength(0);
    expect(agg.from).toBe("2.1.0");
    expect(agg.to).toBe("2.1.0");
  });

  it("fetchRange throws on unknown label", async () => {
    const a = new ForwardNetworksReleaseNotesAdapter(FIXTURE);
    await expect(a.fetchRange("does-not-exist", "3.0.0")).rejects.toThrow(/does-not-exist/);
    await expect(a.fetchRange("2.0.0", "nope")).rejects.toThrow(/nope/);
  });

  it("handles versions with no diff gracefully", async () => {
    const a = new ForwardNetworksReleaseNotesAdapter([
      { label: "1.1.0", from: "2026-01-10", breaking: 0 },
      { label: "1.0.0", from: "2026-01-01", breaking: 0 },
    ]);
    const agg = await a.fetchRange("1.0.0", "1.1.0");
    expect(agg.breakingChanges.added).toHaveLength(0);
    expect(agg.from).toBe("1.0.0");
    expect(agg.to).toBe("1.1.0");
  });
});
