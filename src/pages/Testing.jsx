// Testing page for the static spec site. Shows the results written by
// scripts/test-outcomes.ts; nothing on this page is typed in by hand.
import React from "react";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import SiteHeader, { REPO_URL } from "@/components/site/SiteHeader";
import outcomes from "@/data/test-outcomes.json";

function C({ children }) {
  return <code className="text-xs px-1 py-0.5 bg-secondary rounded">{children}</code>;
}

function Status({ ok, label }) {
  if (ok === null) return <MinusCircle className="w-4 h-4 text-muted-foreground/60" aria-label={label ?? "not applicable"} />;
  return ok
    ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label={label ?? "pass"} />
    : <XCircle className="w-4 h-4 text-red-600" aria-label={label ?? "fail"} />;
}

// "12/12", or a dash when the page has nothing of that kind to check.
function Ratio({ found, total }) {
  if (!total) return <span className="text-muted-foreground/60" title="none on this page">–</span>;
  return (
    <span className={`whitespace-nowrap ${found === total ? "" : "text-red-700 font-medium"}`}>
      {found}/{total}
    </span>
  );
}

function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            {head.map((h, i) => (
              <th key={i} className="py-1.5 pr-4 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const td = "py-1.5 pr-4 align-top";
const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);

export default function Testing() {
  const { forward, segmentation, schema, unit, notFetchable } = outcomes;
  const fwdOk = forward.filter((f) => !f.error);
  const segOk = segmentation.filter((s) => !s.error);
  const schemaRun = schema.filter((s) => !s.skipped && !s.error);

  const fwdTickets = sum(fwdOk, (f) => f.tickets);
  const fwdFound = sum(fwdOk, (f) => f.ticketsFound);
  const segMissed = sum(segOk, (s) => s.ids - s.idsFound + s.ops - s.opsFound);
  const segChecked = sum(segOk, (s) => s.ids + s.ops);
  const indepMissed = sum(segOk, (s) => (s.independent ? s.independent.total - s.independent.found : 0));
  const schemaCorrect = schemaRun.filter((s) => s.correct).length;

  const measured = new Date(outcomes.measuredAt);
  const measuredText = measured.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const summary = [
    {
      ok: fwdFound === fwdTickets && fwdOk.length === forward.length,
      title: "Release notes to changeset",
      text: `${fwdFound} of ${fwdTickets} tickets captured across ${fwdOk.length} Forward releases.`,
      href: "#report",
    },
    {
      ok: segMissed === 0 && indepMissed === 0 && segOk.length === segmentation.length,
      title: "Any vendor's release notes",
      text: `${segOk.length} vendors, each with a different layout. ${segMissed} of ${segChecked} ticket IDs and endpoints missed.`,
      href: "#segment",
    },
    {
      ok: schemaRun.length > 0 ? schemaCorrect === schemaRun.length : null,
      title: "Breaking-change detection",
      text: schemaRun.length > 0
        ? `${schemaCorrect} of ${schemaRun.length} real spec comparisons gave the right build result.`
        : "Skipped: oasdiff was not installed when this ran.",
      href: "#schema",
    },
    {
      ok: unit.fail === 0,
      title: "Unit tests",
      text: `${unit.pass} pass, ${unit.fail} fail, across ${unit.files} files.`,
      href: "#unit",
    },
  ];

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-10 text-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Testing outcomes</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            apidiff is tested against real vendor pages and real API specs, not hand-made samples. Every number
            below comes from one script, and you can rerun it. Live pages change, so these are the results on{" "}
            <strong>{measuredText}</strong> for apidiff <C>{outcomes.version}</C> at commit{" "}
            <a href={`${REPO_URL}/commit/${outcomes.commit}`} className="underline underline-offset-2"><C>{outcomes.commit}</C></a>.
          </p>
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {summary.map((s) => (
              <li key={s.title} className="flex gap-3 py-2.5">
                <span className="pt-0.5"><Status ok={s.ok} /></span>
                <span className="text-sm">
                  <a href={s.href} className="font-medium hover:underline">{s.title}</a>
                  <span className="text-foreground/80">. {s.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="report" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">Release notes to changeset</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            <C>apidiff report</C> on every 2026 Forward Networks release. The test counts each ticket the page
            names, outside the appendix, and checks that it appears in some changeset entry. This is the check that
            caught renamed sections: before v0.3.0, a section such as "Non-breaking changes" was skipped without a
            warning.
          </p>
          <Table head={["Release", "Items", "Changeset entries", "Tickets captured", ""]}>
            {forward.map((f) => (
              <tr key={f.release} className="border-b border-border/60">
                <td className={td}><a href={f.url} className="hover:underline font-mono text-xs">{f.release}</a></td>
                {f.error ? (
                  <td className={td} colSpan={3}><span className="text-red-700">Could not fetch: {f.error}</span></td>
                ) : (
                  <>
                    <td className={td}>{f.items}</td>
                    <td className={td}>{f.changes}</td>
                    <td className={td}><Ratio found={f.ticketsFound} total={f.tickets} /></td>
                  </>
                )}
                <td className={td}><Status ok={f.error ? false : f.ticketsFound === f.tickets} /></td>
              </tr>
            ))}
          </Table>
          <p className="text-xs leading-relaxed text-muted-foreground">
            There are more changeset entries than items because a note that affects three endpoints becomes three
            linked entries.
          </p>
        </section>

        <section id="segment" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">Any vendor's release notes</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            <C>apidiff segment</C> has no rules for any vendor. It works from the page layout alone. Two checks run
            on each page. The first: every ticket ID and every <C>METHOD /path</C> on the page must land in an item.
            The second counts something a person would count by hand, such as headings, linked entries or feed
            posts, and checks that none were lost.
          </p>
          <Table head={["Vendor", "Items", "Ticket IDs", "Endpoints", "Hand count", ""]}>
            {segmentation.map((s) => {
              const ok = s.error
                ? false
                : s.idsFound === s.ids && s.opsFound === s.ops && (!s.independent || s.independent.found === s.independent.total);
              return (
                <tr key={s.vendor} className="border-b border-border/60">
                  <td className={td}><a href={s.url} className="hover:underline whitespace-nowrap">{s.vendor}</a></td>
                  {s.error ? (
                    <td className={td} colSpan={4}><span className="text-red-700">Could not fetch: {s.error}</span></td>
                  ) : (
                    <>
                      <td className={td}>{s.items}</td>
                      <td className={td}><Ratio found={s.idsFound} total={s.ids} /></td>
                      <td className={td}><Ratio found={s.opsFound} total={s.ops} /></td>
                      <td className={`${td} min-w-[9rem]`}>
                        {s.independent ? (
                          <><Ratio found={s.independent.found} total={s.independent.total} /><div className="text-muted-foreground text-xs">{s.independent.what}</div></>
                        ) : (
                          <span className="text-muted-foreground/60" title="the ID and endpoint checks cover this page">–</span>
                        )}
                      </td>
                    </>
                  )}
                  <td className={td}><Status ok={ok} /></td>
                </tr>
              );
            })}
          </Table>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A dash means the page has nothing of that kind to check. For GitHub, NetBox and PagerDuty the ID and
            endpoint checks are the hand count.
          </p>
          {notFetchable.length > 0 && (
            <p className="text-sm leading-relaxed text-foreground/80">
              Not tested:{" "}
              {notFetchable.map((n, i) => (
                <span key={n.name}>
                  {i > 0 && " and "}
                  <a href={n.url} className="underline underline-offset-2">{n.name}</a>
                </span>
              ))}
              . Their pages are built by JavaScript in the browser, so a plain download contains no release notes.
              Save the rendered page and pass it with <C>--raw-html</C>.
            </p>
          )}
        </section>

        <section id="schema" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">Breaking-change detection</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            <C>apidiff schema --fail-on-breaking</C> on pairs of real Forward specs where the right answer is known.
            A correct result means the build fails when the API broke, and passes when it didn't.
          </p>
          <Table head={["Comparison", "Expected", "Breaking", "Deprecated", "Build", ""]}>
            {schema.map((s) => (
              <tr key={`${s.from}-${s.to}`} className="border-b border-border/60">
                <td className={td}>
                  <span className="font-mono text-xs whitespace-nowrap">{s.from} → {s.to}</span>
                  <div className="text-xs text-muted-foreground">{s.note}</div>
                </td>
                <td className={td}>{s.expect === "breaking" ? "breaks" : "no breaks"}</td>
                {s.skipped || s.error ? (
                  <td className={td} colSpan={3}><span className="text-muted-foreground">{s.skipped ?? `Error: ${s.error}`}</span></td>
                ) : (
                  <>
                    <td className={td}>{s.breaking}</td>
                    <td className={td}>{s.deprecated}</td>
                    <td className={td}>{s.failsBuild ? "fails (exit 1)" : "passes"}</td>
                  </>
                )}
                <td className={td}><Status ok={s.skipped ? null : Boolean(s.correct)} /></td>
              </tr>
            ))}
          </Table>
          {outcomes.oasdiff && (
            <p className="text-xs text-muted-foreground">Measured with oasdiff {outcomes.oasdiff}.</p>
          )}
        </section>

        <section id="unit" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-semibold text-foreground">Unit tests</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            {unit.pass} tests pass and {unit.fail} fail, across {unit.files} files, with {unit.expects} checks.
            They cover the release-notes parser, the segmenter, the oasdiff output parser, the spec diff, the
            migration guide builder and the URL safety checks. CI runs them, and validates every changeset example
            against the schema, on each pull request that changes the code or the spec, and before every release.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">What these tests don't show</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-foreground/80">
            <li>
              Whether a change is labelled correctly. <C>report</C> trusts the vendor's own section names, so an
              item filed under the wrong heading gets the wrong label.
            </li>
            <li>
              <C>segment</C> finds items. It doesn't decide which ones are breaking.
            </li>
            <li>
              Only Forward's release notes are turned into full changesets here. The other vendors are tested for
              segmentation only.
            </li>
            <li>
              Vendor pages change. A layout that works today can change tomorrow, which is why both commands warn
              when something on the page isn't accounted for.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Run it yourself</h2>
          <pre
            className="rounded-lg overflow-auto text-[11px] leading-relaxed font-mono p-4"
            style={{ background: "#24292e", color: "#e1e4e8" }}
          >{`git clone ${REPO_URL} && cd apidiff
bun install
bun scripts/test-outcomes.ts      # writes src/data/test-outcomes.json`}</pre>
          <p className="text-sm leading-relaxed text-foreground/80">
            It needs network access, and <C>oasdiff</C> for the breaking-change checks. See{" "}
            <a href={`${REPO_URL}/blob/main/scripts/test-outcomes.ts`} className="underline underline-offset-2">scripts/test-outcomes.ts</a>.
          </p>
        </section>
      </main>
    </div>
  );
}
