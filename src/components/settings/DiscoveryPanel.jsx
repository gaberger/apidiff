import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Plus, ExternalLink, GitBranch, BookOpen, Bot } from "lucide-react";

export default function DiscoveryPanel({ onAddComparisons }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [changelogUrl, setChangelogUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function handleDiscover() {
    if (!baseUrl.trim()) return;
    setRunning(true);
    setResults(null);
    setError(null);
    setSelected(new Set());
    setStatusMsg("Starting AI discovery…");

    try {
      const prompt = [
        `Find all versioned OpenAPI spec files for this API: ${baseUrl.trim()}`,
        changelogUrl.trim() ? `Changelog URL: ${changelogUrl.trim()}` : "",
        "Return ONLY valid JSON with keys: versions (array of {label,url,version}), changelog_versions (array of strings), pairs (array of {label,v1_url,v2_url}).",
      ].filter(Boolean).join("\n");

      // Create a conversation with the agent
      const conversation = await base44.agents.createConversation({
        agent_name: "api_discovery",
        metadata: { name: `Discover: ${baseUrl.trim()}` },
      });

      await base44.agents.addMessage(conversation, { role: "user", content: prompt });

      setStatusMsg("AI is searching for versioned specs…");

      // Poll for completion
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          try {
            const conv = await base44.agents.getConversation(conversation.id);
            const messages = conv.messages || [];
            const last = messages[messages.length - 1];
            if (last?.role === "assistant" && last.content) {
              clearInterval(pollRef.current);
              try {
                // Strip markdown fences if present
                const clean = last.content.replace(/```(?:json)?/g, "").trim();
                const parsed = JSON.parse(clean);
                setResults(parsed);
              } catch {
                setError("Agent returned an unexpected response. Try rephrasing the URL.");
              }
              resolve();
            }
          } catch (e) {
            clearInterval(pollRef.current);
            reject(e);
          }
        }, 2000);

        // Timeout after 60s
        setTimeout(() => {
          clearInterval(pollRef.current);
          reject(new Error("Discovery timed out. Please try again."));
        }, 60000);
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
      setStatusMsg("");
    }
  }

  function togglePair(idx) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function handleAdd() {
    const pairs = (results?.pairs || []).filter((_, i) => selected.has(i));
    onAddComparisons(pairs);
    setResults(null);
    setBaseUrl("");
    setChangelogUrl("");
    setSelected(new Set());
  }

  return (
    <div className="border border-amber-200 rounded-lg bg-amber-50/50 p-4 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 uppercase tracking-wider">
        <Bot className="w-3.5 h-3.5" />
        AI Version Discovery
      </div>

      {/* Inputs */}
      <div className="space-y-2">
        <div>
          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
            API / GitHub URL
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
            placeholder="https://github.com/stripe/openapi  or  https://api.example.com"
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-stone-200 rounded-md bg-white focus:outline-none focus:border-amber-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
            Changelog URL <span className="text-stone-400 font-normal normal-case">(optional)</span>
          </label>
          <input
            value={changelogUrl}
            onChange={(e) => setChangelogUrl(e.target.value)}
            placeholder="https://stripe.com/docs/upgrades"
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-stone-200 rounded-md bg-white focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={handleDiscover}
        disabled={running || !baseUrl.trim()}
        className="h-8 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
      >
        {running ? (
          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{statusMsg || "Discovering…"}</>
        ) : (
          <><Search className="w-3.5 h-3.5 mr-1.5" />Discover with AI</>
        )}
      </Button>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-3">
          {results.versions?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
                <GitBranch className="w-3 h-3" /> Discovered Specs ({results.versions.length})
              </div>
              <div className="space-y-1">
                {results.versions.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-white border border-stone-200 rounded px-2.5 py-1.5">
                    <span className="font-mono font-semibold text-stone-700 truncate flex-1">{v.label}</span>
                    <a href={v.url} target="_blank" rel="noreferrer" className="text-stone-400 hover:text-amber-600">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.changelog_versions?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
                <BookOpen className="w-3 h-3" /> Changelog Versions ({results.changelog_versions.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {results.changelog_versions.map((v, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-stone-100 text-stone-600 border border-stone-200">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {results.pairs?.length > 0 ? (
            <div>
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
                Select Comparisons to Add
              </div>
              <div className="space-y-1.5">
                {results.pairs.map((pair, i) => (
                  <label key={i} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => togglePair(i)}
                      className="rounded border-stone-300"
                    />
                    <span className="text-xs font-mono text-stone-700 group-hover:text-stone-900">{pair.label}</span>
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={selected.size === 0}
                className="mt-3 h-8 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add {selected.size > 0 ? selected.size : ""} Comparison{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-stone-500 italic">
              No comparison pairs found. The AI may need a more specific URL.
            </p>
          )}
        </div>
      )}
    </div>
  );
}