// Tools page for the static spec site: what each apidiff command is for and
// how to use it. Command output samples are real runs against docs.fwd.app.
import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, Github } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import {
  REPO_URL as REPO, LATEST_RELEASE_URL, INSTALL_CMD, PIN_CMD, DIR_CMD, DEFAULT_DIR, ASSETS,
} from "@/components/site/install.js";

// Dark block for shell commands and terminal output; matches CodeBlock's
// github-dark theme, which only highlights JSON and YAML.
function Terminal({ children, maxHeight = "28rem" }) {
  const lines = String(children).replace(/\n$/, "").split("\n");
  return (
    <pre
      className="rounded-lg overflow-auto text-[11px] leading-relaxed font-mono p-4"
      style={{ background: "#24292e", color: "#e1e4e8", maxHeight }}
    >
      {lines.map((line, i) => (
        <div key={i}>
          {line.startsWith("$ ") ? (
            <>
              <span style={{ color: "#6a737d" }}>$ </span>
              <span style={{ color: "#f0f6fc" }}>{line.slice(2)}</span>
            </>
          ) : line.startsWith("# ") ? (
            <span style={{ color: "#6a737d" }}>{line}</span>
          ) : (
            line || " "
          )}
        </div>
      ))}
    </pre>
  );
}

function C({ children }) {
  return <code className="text-xs px-1 py-0.5 bg-secondary rounded">{children}</code>;
}

function FlagTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-1.5 pr-4 font-medium">Flag</th>
            <th className="py-1.5 font-medium">What it does</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([flag, desc]) => (
            <tr key={flag} className="border-b border-border/60 align-top">
              <td className="py-1.5 pr-4 whitespace-nowrap"><C>{flag}</C></td>
              <td className="py-1.5 text-foreground/80">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COMMANDS = [
  ["report", "#report", "Turn a release-notes page into a changeset YAML and a terminal summary."],
  ["segment", "#segment", "Split any vendor's release-notes page into items, and check none were missed."],
  ["schema", "#schema", "Compare two OpenAPI specs with oasdiff. Fails your CI build on breaking changes."],
  ["diff", "#diff", "Compare two specs field by field, or fetch two versions from a known provider."],
  ["guide", "#guide", "Write a migration guide between two spec files."],
];

export default function Tools() {
  // Links such as /tools#install should land on that section.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-10 text-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">The apidiff command line tool</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            <C>apidiff</C> reads what an API vendor publishes, either release notes or OpenAPI specs, and
            tells you what changed and what you have to do about it. Its main output is a{" "}
            <Link to="/" className="underline underline-offset-2">changeset</Link>: one YAML document per release
            that tools and people can both read.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {COMMANDS.map(([name, href, desc]) => (
                  <tr key={name} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <a href={href} className="font-mono text-xs font-semibold text-amber-700 hover:underline">
                        apidiff {name}
                      </a>
                    </td>
                    <td className="py-2 text-foreground/80">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="install" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">Install</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            On macOS or Linux, run this in a terminal:
          </p>
          <Terminal>{`$ ${INSTALL_CMD}`}</Terminal>
          <p className="text-sm leading-relaxed text-foreground/80">
            The script picks the right file for your computer, checks it against the release's{" "}
            <C>SHA256SUMS</C>, and installs it to <C>{DEFAULT_DIR}</C>. If the checksum doesn't match, it installs
            nothing. It needs only <C>curl</C>, and you don't need Node or Bun.{" "}
            <a href={`${REPO}/blob/main/install.sh`} className="underline underline-offset-2">Read the script</a>{" "}
            before you run it if you prefer.
          </p>
          <Terminal>{`# Install a specific release
$ ${PIN_CMD}

# Install somewhere else
$ ${DIR_CMD}`}</Terminal>
          <p className="text-sm leading-relaxed text-foreground/80">
            On Windows, or to download by hand, get your file from the{" "}
            <a href={LATEST_RELEASE_URL} className="underline underline-offset-2">latest release</a>:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-4 font-medium">Platform</th>
                  <th className="py-1.5 font-medium">File</th>
                </tr>
              </thead>
              <tbody>
                {ASSETS.map(({ platform: p, file: f }) => (
                  <tr key={f} className="border-b border-border/60">
                    <td className="py-1.5 pr-4 text-foreground/80">{p}</td>
                    <td className="py-1.5"><C>{f}</C></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">
            The Linux files need glibc, so they don't run on Alpine. <C>apidiff schema</C> also needs{" "}
            <a href="https://github.com/oasdiff/oasdiff" className="underline underline-offset-2">oasdiff</a>.
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">To run from source instead:</p>
          <Terminal>{`$ git clone ${REPO} && cd apidiff
$ bun install
$ bun src/cli.ts report https://docs.fwd.app/release-notes/api/2026/release.26.9.0/`}</Terminal>
        </section>

        <section id="report" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">apidiff report</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            Give it a release-notes page. It reads every section, turns each item into a changeset entry, writes the
            YAML, and prints what matters: what breaks, what is scheduled to break, and which endpoints are affected.
          </p>
          <Terminal>{`$ apidiff report https://docs.fwd.app/release-notes/api/2026/release.26.9.0/

Forward Networks API  26.9.0
released 2026-09-25

  breaking         0  [........................]
  deprecations     3  [#####...................]
  notice          13  [######################..]
  info             1  [##......................]
  total           14  [########################]

Scheduled breaking changes  (3)
  • FWD-52020
      GET /api/networks/{networkId}/collector/status  +2 more
  • FWD-57483
      GET /api/snapshots/{snapshotId}/topology/overrides  +2 more
  • FWD-58049
      GET /api/networks/{networkId}/snapshots/latestProcessed

Non-breaking changes  (10)
  • FWD-58044
      GET /api/networks/{networkId}/snapshots
  …

✓ wrote changeset-26.9.0.yaml  (26 changes)`}</Terminal>
          <p className="text-sm leading-relaxed text-foreground/80">
            The summary counts release-note items: 14 here. The YAML has one entry per affected endpoint: 26 here. A
            note that deprecates three endpoints becomes three entries, linked to each other through{" "}
            <C>related</C>.
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">
            If a section heading is spelled a little differently from the ones apidiff knows, it still matches and
            prints a <C>note:</C> line. If a heading is unknown, apidiff prints a <C>warn:</C> line and keeps the
            items under "Unclassified", so nothing is silently dropped.
          </p>
          <FlagTable
            rows={[
              ["--out <path>", "Where to write the YAML. Default: changeset-<version>.yaml"],
              ["--no-yaml", "Print the summary only. Don't write a file."],
              ["--verbose", "Show every item and every affected endpoint, not the first few."],
              ["--api-name <name>", "Set api.name in the YAML."],
              ["--from <ver>, --to <ver>", "Set the versions the changeset goes between."],
              ["--released <YYYY-MM-DD>", "Set the release date."],
              ["--raw-html <path>", "Read a saved HTML file instead of fetching the URL. Use this for pages built by JavaScript."],
              ["--no-color", "Plain text output. This is automatic when the output isn't a terminal."],
            ]}
          />
        </section>

        <section id="segment" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">apidiff segment</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            Every vendor lays out release notes differently. <C>segment</C> doesn't need to know the vendor. It
            reads the page layout, splits it into items, and then checks its own work: every ticket ID and every{" "}
            <C>METHOD /path</C> on the page must land in some item. It has been checked on pages from Stripe,
            GitHub, Slack, Atlassian, Okta, NetBox, Twilio, PagerDuty, Microsoft Graph and Forward.
          </p>
          <Terminal>{`$ apidiff segment https://docs.fwd.app/release-notes/api/2026/release.26.9.0/

  container main
  items     14  (13 list items, 1 sections)
  ids       14/14 covered
  ops       21/21 covered

  • 26.9.0 - Sep 25 › Scheduled breaking changes  ::  FWD-52020
  • 26.9.0 - Sep 25 › Scheduled breaking changes  ::  FWD-57483
  • 26.9.0 - Sep 25 › Non-breaking changes  ::  FWD-58044
  …`}</Terminal>
          <p className="text-sm leading-relaxed text-foreground/80">
            <C>segment</C> doesn't decide whether an item is breaking. Use <C>--json</C> to hand the items to
            another tool or an AI agent that does.
          </p>
          <FlagTable
            rows={[
              ["--json", "Print every item as JSON: its heading path, text, IDs and endpoints."],
              ["--raw-html <path>", "Read a saved HTML file instead of fetching the URL."],
              ["--fail-on-missing", "Exit with code 2 if any ID or endpoint on the page is in no item."],
            ]}
          />
        </section>

        <section id="schema" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">apidiff schema</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            Compares two OpenAPI specs using <a href="https://github.com/oasdiff/oasdiff" className="underline underline-offset-2">oasdiff</a>,
            which you install separately (<C>brew install oasdiff</C>). Each change is graded <C>error</C>{" "}
            (breaking), <C>warning</C> or <C>info</C>.
          </p>
          <Terminal>{`$ apidiff schema https://docs.fwd.app/26.3/api/spec/complete.json \\
                 https://docs.fwd.app/26.4/api/spec/complete.json --mode breaking

70 changes: 12 error, 58 warning, 0 info
error	[response-property-type-changed]
	in API GET /networks
		the '/items/createdAt' response's property type/format changed
		from 'integer'/'int64' to 'string'/'' for status '200'
…

  12 breaking  |  0 deprecated  |  58 non-breaking`}</Terminal>
          <FlagTable
            rows={[
              ["--mode changelog", "Every change. This is the default."],
              ["--mode breaking", "Breaking changes and warnings only."],
              ["--mode summary", "A YAML count of changes by area, without the details."],
              ["--fail-on-breaking", "Exit with code 1 if anything is breaking. Use this in CI."],
            ]}
          />
        </section>

        <section id="diff" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">apidiff diff</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            Compares two specs field by field and labels each difference: <C>added</C>, <C>removed</C>,{" "}
            <C>changed</C>, <C>moved</C>, <C>renamed</C> or <C>type-change</C>. Pass two files or URLs, or a
            provider and two versions. The providers it knows are <C>forward</C>, <C>stripe</C>, <C>github</C>{" "}
            and <C>twilio</C>.
          </p>
          <Terminal>{`$ apidiff diff --provider forward 26.8 26.9

  55 change(s) detected

  [changed]   info.version  "26.8" → "26.9"
  [changed]   paths./networks/{networkId}/snapshots.get.summary
              "List all Snapshots" → "List network Snapshots"
  [removed]   paths./snapshots/{snapshotId}.get.parameters.only.name  "only"
  …

  5 changed  |  2 moved  |  12 removed  |  3 type-change  |  33 added`}</Terminal>
        </section>

        <section id="guide" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">apidiff guide</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            Writes a migration guide between two spec files, with a checklist of what to change. Label the versions
            and give a sunset date if there is one.
          </p>
          <Terminal>{`$ apidiff guide old.json new.json --base v1 --revision v2 --sunset 2026-12-31`}</Terminal>
        </section>

        <section id="ci" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">Use it in CI</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            To stop a pull request that breaks your API, compare the spec on your main branch with the spec in the
            pull request. The step fails when anything is breaking.
          </p>
          <Terminal>{`# Fails the build (exit 1) on any breaking change
$ apidiff schema main/openapi.json openapi.json --mode breaking --fail-on-breaking`}</Terminal>
          <p className="text-sm leading-relaxed text-foreground/80">
            To check that nothing was lost when you read a vendor's release notes, run{" "}
            <C>apidiff segment &lt;url&gt; --fail-on-missing</C>. It exits with code 2 if any ticket or endpoint
            didn't make it into an item.
          </p>
        </section>

        <section className="border-t border-border pt-6 flex flex-wrap gap-2">
          <a
            href={LATEST_RELEASE_URL}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Latest release
          </a>
          <a
            href={REPO}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-accent transition-colors"
          >
            <Github className="w-3.5 h-3.5" /> Source and issues
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
