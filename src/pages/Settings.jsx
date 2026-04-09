import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save, ChevronDown, ChevronUp } from "lucide-react";
import DiscoveryPanel from "@/components/settings/DiscoveryPanel";

function emptyComparison() {
  return { label: "", v1_url: "", v2_url: "" };
}

function emptyIntegration() {
  return { name: "", color: "#635BFF", comparisons: [emptyComparison()] };
}

export default function Settings() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [newIntegration, setNewIntegration] = useState(null);

  useEffect(() => {
    base44.entities.Integration.list().then((data) => {
      setIntegrations(data);
      setLoading(false);
    });
  }, []);

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function saveIntegration(integration) {
    setSaving(integration.id || "new");
    if (integration.id) {
      const updated = await base44.entities.Integration.update(integration.id, integration);
      setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } else {
      const created = await base44.entities.Integration.create(integration);
      setIntegrations((prev) => [...prev, created]);
      setNewIntegration(null);
    }
    setSaving(null);
  }

  async function deleteIntegration(id) {
    await base44.entities.Integration.delete(id);
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
  }

  function updateField(id, field, value) {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  }

  function updateComparison(id, idx, field, value) {
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const comparisons = i.comparisons.map((c, ci) =>
          ci === idx ? { ...c, [field]: value } : c
        );
        return { ...i, comparisons };
      })
    );
  }

  function addComparison(id) {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, comparisons: [...(i.comparisons || []), emptyComparison()] } : i
      )
    );
  }

  function addDiscoveredComparisons(id, pairs) {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, comparisons: [...(i.comparisons || []), ...pairs] }
          : i
      )
    );
  }

  function removeComparison(id, idx) {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, comparisons: i.comparisons.filter((_, ci) => ci !== idx) }
          : i
      )
    );
  }

  // new integration form helpers
  function updateNewField(field, value) {
    setNewIntegration((prev) => ({ ...prev, [field]: value }));
  }

  function updateNewComparison(idx, field, value) {
    setNewIntegration((prev) => {
      const comparisons = prev.comparisons.map((c, ci) =>
        ci === idx ? { ...c, [field]: value } : c
      );
      return { ...prev, comparisons };
    });
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="px-4 sm:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="p-1.5 rounded hover:bg-stone-100 text-stone-500 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-bold text-stone-800">Integration Settings</h1>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => setNewIntegration(emptyIntegration())}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Integration
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-4">
        {loading && (
          <p className="text-sm text-stone-400">Loading integrations…</p>
        )}

        {/* Existing integrations */}
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            expanded={!!expanded[integration.id]}
            onToggle={() => toggleExpand(integration.id)}
            onSave={() => saveIntegration(integration)}
            onDelete={() => deleteIntegration(integration.id)}
            onFieldChange={(f, v) => updateField(integration.id, f, v)}
            onComparisonChange={(idx, f, v) => updateComparison(integration.id, idx, f, v)}
            onAddComparison={() => addComparison(integration.id)}
            onAddDiscoveredComparisons={(pairs) => addDiscoveredComparisons(integration.id, pairs)}
            onRemoveComparison={(idx) => removeComparison(integration.id, idx)}
            saving={saving === integration.id}
          />
        ))}

        {/* New integration form */}
        {newIntegration && (
          <IntegrationCard
            integration={newIntegration}
            expanded={true}
            onToggle={() => {}}
            onSave={() => saveIntegration(newIntegration)}
            onDelete={() => setNewIntegration(null)}
            onFieldChange={(f, v) => updateNewField(f, v)}
            onComparisonChange={(idx, f, v) => updateNewComparison(idx, f, v)}
            onAddComparison={() =>
              setNewIntegration((prev) => ({
                ...prev,
                comparisons: [...prev.comparisons, emptyComparison()],
              }))
            }
            onAddDiscoveredComparisons={(pairs) =>
              setNewIntegration((prev) => ({
                ...prev,
                comparisons: [...prev.comparisons, ...pairs],
              }))
            }
            saving={saving === "new"}
            isNew
          />
        )}

        {!loading && integrations.length === 0 && !newIntegration && (
          <div className="text-center py-16 text-stone-400 text-sm">
            No integrations yet. Click "Add Integration" to create one.
          </div>
        )}
      </main>
    </div>
  );
}

function IntegrationCard({
  integration,
  expanded,
  onToggle,
  onSave,
  onDelete,
  onFieldChange,
  onComparisonChange,
  onAddComparison,
  onAddDiscoveredComparisons,
  onRemoveComparison,
  saving,
  isNew,
}) {
  const [showDiscovery, setShowDiscovery] = useState(false);

  function handleDiscoveredPairs(pairs) {
    onAddDiscoveredComparisons(pairs);
    setShowDiscovery(false);
  }
  return (
    <div className="border border-stone-200 rounded-lg bg-white overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={onToggle}
        style={{ borderLeft: `3px solid ${integration.color || "#888"}` }}
      >
        {integration.logo_url ? (
          <img src={integration.logo_url} alt={integration.name} className="w-[18px] h-[18px] object-contain rounded flex-shrink-0" />
        ) : (
          <div
            className="w-4 h-4 rounded-full border border-stone-200 flex-shrink-0"
            style={{ background: integration.color || "#888" }}
          />
        )}
        <span className="flex-1 text-sm font-medium text-stone-700">
          {integration.name || <span className="text-stone-400 italic">New Integration</span>}
        </span>
        <span className="text-xs text-stone-400">
          {(integration.comparisons || []).length} comparison{(integration.comparisons || []).length !== 1 ? "s" : ""}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-stone-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-stone-400" />
        )}
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-stone-100 space-y-4">
          {/* Name + color */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Name</label>
              <input
                value={integration.name}
                onChange={(e) => onFieldChange("name", e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-md bg-stone-50 focus:outline-none focus:border-amber-400"
                placeholder="e.g. Stripe"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Color</label>
              <input
                type="color"
                value={integration.color || "#635BFF"}
                onChange={(e) => onFieldChange("color", e.target.value)}
                className="w-10 h-9 rounded border border-stone-200 cursor-pointer"
              />
            </div>
          </div>

          {/* Discovery URLs */}
          <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Auto-Discovery (runs daily)</p>
            <div>
              <label className="block text-[11px] text-stone-500 mb-1">API / GitHub Base URL</label>
              <input
                value={integration.base_url || ""}
                onChange={(e) => onFieldChange("base_url", e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono border border-stone-200 rounded bg-white focus:outline-none focus:border-amber-400"
                placeholder="https://github.com/stripe/openapi"
              />
            </div>
            <div>
              <label className="block text-[11px] text-stone-500 mb-1">Changelog URL (optional)</label>
              <input
                value={integration.changelog_url || ""}
                onChange={(e) => onFieldChange("changelog_url", e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono border border-stone-200 rounded bg-white focus:outline-none focus:border-amber-400"
                placeholder="https://stripe.com/docs/upgrades"
              />
            </div>
          </div>

          {/* Comparisons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Version Comparisons
              </label>
              <button
                onClick={() => setShowDiscovery((v) => !v)}
                className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold underline underline-offset-2"
              >
                {showDiscovery ? "Hide discovery" : "Discover versions…"}
              </button>
            </div>

            {showDiscovery && (
              <div className="mb-3">
                <DiscoveryPanel onAddComparisons={handleDiscoveredPairs} />
              </div>
            )}

            <div className="space-y-3">
              {(integration.comparisons || []).map((comp, idx) => (
                <div key={idx} className="border border-stone-200 rounded-md p-3 bg-stone-50 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={comp.label}
                      onChange={(e) => onComparisonChange(idx, "label", e.target.value)}
                      className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded bg-white focus:outline-none focus:border-amber-400"
                      placeholder="Label (e.g. v1 → v2)"
                    />
                    <button
                      onClick={() => onRemoveComparison(idx)}
                      className="p-1 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={comp.v1_url}
                    onChange={(e) => onComparisonChange(idx, "v1_url", e.target.value)}
                    className="w-full px-2 py-1 text-xs font-mono border border-stone-200 rounded bg-white focus:outline-none focus:border-amber-400"
                    placeholder="Old spec URL (https://...)"
                  />
                  <input
                    value={comp.v2_url}
                    onChange={(e) => onComparisonChange(idx, "v2_url", e.target.value)}
                    className="w-full px-2 py-1 text-xs font-mono border border-stone-200 rounded bg-white focus:outline-none focus:border-amber-400"
                    placeholder="New spec URL (https://...)"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={onAddComparison}
              className="mt-2 flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add comparison
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isNew ? "Cancel" : "Delete"}
            </button>
            <Button size="sm" className="h-8 text-xs" onClick={onSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}