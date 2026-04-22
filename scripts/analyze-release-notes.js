#!/usr/bin/env bun
import { spawn } from "bun";

const BASE_URL = "https://docs.fwd.app/release-notes/api";

async function runAgentBrowser(args) {
  const proc = spawn({
    cmd: ["agent-browser", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  
  const [stdout, stderr] = await [proc.stdout.text(), proc.stderr.text()];
  const exitCode = await proc.exited;
  
  if (exitCode !== 0 && stderr) {
    throw new Error(stderr);
  }
  
  return stdout;
}

async function initBrowser() {
  console.log("Initializing browser session...");
  await runAgentBrowser(["open", "about:blank", "--session", "apidiff"]);
  console.log("Browser session started");
}

async function closeBrowser() {
  try {
    await runAgentBrowser(["close", "--session", "apidiff"]);
  } catch {}
}

async function fetchReleaseNotesWithBrowser(year, version) {
  const url = `${BASE_URL}/${year}/release.${version}/`;
  console.log(`Fetching: ${url}`);
  
  try {
    await runAgentBrowser(["open", url, "--session", "apidiff"]);
    await runAgentBrowser(["wait", "--load", "networkidle", "--session", "apidiff"]);
    
    const html = await runAgentBrowser(["get", "html", "article", "--session", "apidiff"]);
    
    if (!html || html.trim() === "") {
      console.error("No article content found");
      return null;
    }
    
    return parseReleaseNotes(html, year, version);
  } catch (error) {
    console.error(`Error fetching ${url}: ${error.message}`);
    return null;
  }
}

function parseReleaseNotes(html, year, version) {
  const releaseDateMatch = html.match(/Released:\s*(\d{4}-\d{2}-\d{2})/);
  const releaseDate = releaseDateMatch ? releaseDateMatch[1] : null;

  const sections = {
    breakingChanges: extractSection(html, "Breaking changes", "Scheduled breaking changes"),
    scheduledBreakingChanges: extractSection(html, "Scheduled breaking changes", "Query parameter changes"),
    queryParameterChanges: extractSection(html, "Query parameter changes", "New operations"),
    newOperations: extractSection(html, "New operations", "New models"),
    newModels: extractSection(html, "New models", "Model changes"),
    modelChanges: extractSection(html, "Model changes", "Documentation changes"),
  };

  return {
    year,
    version,
    releaseDate,
    url: `${BASE_URL}/${year}/release.${version}/`,
    ...sections,
  };
}

function extractSection(html, startHeading, endHeading) {
  const startIdx = html.indexOf(startHeading);
  if (startIdx === -1) return [];
  
  let endIdx = html.indexOf(endHeading, startIdx);
  if (endIdx === -1) endIdx = html.length;
  
  const sectionContent = html.substring(startIdx, endIdx);
  
  const items = [];
  const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  
  while ((match = itemRegex.exec(sectionContent)) !== null) {
    const content = match[1];
    
    const titleMatch = content.match(/<strong[^>]*>([\s\S]*?)<\/strong>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    
    const descMatch = content.match(/<strong[^>]*>[\s\S]*?<\/strong>\s*([\s\S]*?)(?=<ul|$)/);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    
    const opRegex = /<(?:p|ul)[^>]*>([\s\S]*?)<\/(?:p|ul)>/g;
    const affectedOps = [];
    let opMatch;
    const opContent = content;
    
    while ((opMatch = opRegex.exec(opContent)) !== null) {
      const opText = opMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (opText.match(/^(POST|GET|PUT|PATCH|DELETE)\s+\/api\//)) {
        affectedOps.push(opText);
      }
    }
    
    if (title || description) {
      items.push({
        title,
        description,
        affectedOps,
      });
    }
  }
  
  return items;
}

async function discoverVersions() {
  console.log("Discovering available versions...");
  
  const versions = [];
  
  const yearsToFetch = [
    { year: 2026, versions: ["26.3.0", "26.2.0", "26.1.0"] },
    { year: 2025, versions: ["25.12.0", "25.11.0", "25.10.0", "25.9.0", "25.8.0", "25.7.0", "25.6.0", "25.5.0", "25.4.0", "25.3.0", "25.2.0", "25.1.0"] },
    { year: 2024, versions: ["24.12.0", "24.11.0", "24.10.0", "24.9.0", "24.8.0", "24.7.0", "24.6.0", "24.5.0", "24.4.0", "24.3.0", "24.2.0", "24.1.0"] },
    { year: 2023, versions: ["23.12.0", "23.11.0", "23.10.0", "23.9.0", "23.8.0", "23.7.0", "23.6.0", "23.5.0", "23.4.0", "23.3.0", "23.2.0", "23.1.0"] },
  ];
  
  for (const { year, versions: vs } of yearsToFetch) {
    for (const ver of vs) {
      versions.push({ year, version: ver, key: `${year}.${ver}` });
    }
  }
  
  console.log(`Discovered ${versions.length} versions`);
  
  return versions.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });
}

function computeVersionDiff(oldRelease, newRelease) {
  const diff = {
    from: oldRelease?.version || "none",
    to: newRelease.version,
    breakingChanges: { added: [], removed: [] },
    scheduledBreakingChanges: { added: [], removed: [] },
    newOperations: { added: [], removed: [] },
    newModels: { added: [], removed: [] },
    modelChanges: { added: [], removed: [] },
  };

  if (!oldRelease) {
    diff.breakingChanges.added = newRelease.breakingChanges;
    diff.scheduledBreakingChanges.added = newRelease.scheduledBreakingChanges;
    diff.newOperations.added = newRelease.newOperations;
    diff.newModels.added = newRelease.newModels;
    diff.modelChanges.added = newRelease.modelChanges;
    return diff;
  }

  const oldBC = oldRelease.breakingChanges.map(c => c.title);
  const newBC = newRelease.breakingChanges.map(c => c.title);
  diff.breakingChanges.added = newRelease.breakingChanges.filter(c => !oldBC.includes(c.title));
  
  const oldSBC = oldRelease.scheduledBreakingChanges.map(c => c.title);
  const newSBC = newRelease.scheduledBreakingChanges.map(c => c.title);
  diff.scheduledBreakingChanges.added = newRelease.scheduledBreakingChanges.filter(c => !oldSBC.includes(c.title));

  const oldOps = oldRelease.newOperations.map(o => o.title);
  const newOps = newRelease.newOperations.map(o => o.title);
  diff.newOperations.added = newRelease.newOperations.filter(o => !oldOps.includes(o.title));

  const oldModels = oldRelease.newModels.map(m => m.title);
  const newModels = newRelease.newModels.map(m => m.title);
  diff.newModels.added = newRelease.newModels.filter(m => !oldModels.includes(m.title));

  const oldMC = oldRelease.modelChanges.map(c => c.title);
  const newMC = newRelease.modelChanges.map(c => c.title);
  diff.modelChanges.added = newRelease.modelChanges.filter(c => !oldMC.includes(c.title));

  return diff;
}

function generateDiffReport(diffs) {
  console.log("\n" + "=".repeat(80));
  console.log("API RELEASE NOTES VERSION DIFF");
  console.log("=".repeat(80));

  for (const d of diffs) {
    console.log(`\n## ${d.from} → ${d.to}`);
    
    if (d.breakingChanges.added.length > 0) {
      console.log(`\n### + Breaking Changes (${d.breakingChanges.added.length})`);
      for (const c of d.breakingChanges.added) {
        console.log(`  + ${c.title}`);
      }
    }

    if (d.scheduledBreakingChanges.added.length > 0) {
      console.log(`\n### + Scheduled Breaking Changes (${d.scheduledBreakingChanges.added.length})`);
      for (const c of d.scheduledBreakingChanges.added) {
        console.log(`  + ${c.title}`);
      }
    }

    if (d.newOperations.added.length > 0) {
      console.log(`\n### + New Operations (${d.newOperations.added.length})`);
      for (const o of d.newOperations.added) {
        console.log(`  + ${o.title}`);
        for (const op of o.affectedOps) {
          console.log(`    ${op}`);
        }
      }
    }

    if (d.newModels.added.length > 0) {
      console.log(`\n### + New Models (${d.newModels.added.length})`);
      for (const m of d.newModels.added) {
        console.log(`  + ${m.title}`);
      }
    }

    if (d.modelChanges.added.length > 0) {
      console.log(`\n### + Model Changes (${d.modelChanges.added.length})`);
      for (const c of d.modelChanges.added) {
        console.log(`  + ${c.title}`);
      }
    }

    if (d.breakingChanges.added.length === 0 && 
        d.scheduledBreakingChanges.added.length === 0 && 
        d.newOperations.added.length === 0 && 
        d.newModels.added.length === 0 && 
        d.modelChanges.added.length === 0) {
      console.log("\n  (no changes)");
    }
  }

  console.log("\n" + "=".repeat(80));
}

async function main() {
  try {
    await initBrowser();
    
    const versions = await discoverVersions();
    console.log(`Found ${versions.length} versions`);
    
    const releases = [];
    for (const v of versions) {
      const release = await fetchReleaseNotesWithBrowser(v.year, v.version);
      if (release) {
        releases.push(release);
      }
    }

    const diffs = [];
    for (let i = 0; i < releases.length; i++) {
      const oldRelease = i < releases.length - 1 ? releases[i + 1] : null;
      const newRelease = releases[i];
      const diff = computeVersionDiff(oldRelease, newRelease);
      diffs.push(diff);
    }

    generateDiffReport(diffs);

    const fs = await import("fs");
    const outputPath = "./release-notes-diff.json";
    fs.writeFileSync(outputPath, JSON.stringify({
      versions: releases.map(r => ({ version: r.version, year: r.year, releaseDate: r.releaseDate })),
      diffs
    }, null, 2));
    console.log(`\nDiff data saved to: ${outputPath}`);

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await closeBrowser();
  }
}

main();
