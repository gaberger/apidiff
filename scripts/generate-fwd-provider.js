#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "fs";

const diffData = JSON.parse(readFileSync("./release-notes-diff.json", "utf-8"));

const fnProvider = {
  id: "fwdnetworks",
  name: "Forward Networks",
  color: "#FF6B35",
  icon: "M12 2L2 19.5h20L12 2zm0 4.5l10.5 15h-21L12 6.5z",
  versions: diffData.versions.map((v, idx) => {
    const diff = diffData.diffs[idx];
    const breakingCount = (diff?.breakingChanges?.added?.length || 0) + 
                          (diff?.scheduledBreakingChanges?.added?.length || 0);
    
    const newOpsCount = diff?.newOperations?.added?.length || 0;
    const newModelsCount = diff?.newModels?.added?.length || 0;
    const modelChangesCount = diff?.modelChanges?.added?.length || 0;
    
    return {
      label: v.version,
      from: v.releaseDate,
      to: v.releaseDate,
      breaking: breakingCount,
      diff: diff || null,
      stats: {
        newOperations: newOpsCount,
        newModels: newModelsCount,
        modelChanges: modelChangesCount,
      },
      v1: null,
      v2: null,
    };
  }),
};

console.log(JSON.stringify(fnProvider, null, 2));
