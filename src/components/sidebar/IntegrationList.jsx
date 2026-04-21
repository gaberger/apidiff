import { useState, useEffect, useMemo } from "react";
import { PanelLeftClose, PanelLeft, Settings, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { integrationStore } from "@/lib/integration-store";
import { motion } from "framer-motion";
import { PROVIDER_REGISTRY } from "@/lib/domain/provider-registry.js";
import fwdData from "@/data/fwdnetworks.json";

// Category ordering + display labels — domain knows the slugs ("payments"), UI owns the
// presentation order (by usage frequency) and human labels.
const CATEGORY_ORDER = [
  "payments",
  "communications",
  "developer-tools",
  "cloud",
  "ai",
  "identity",
  "social",
  "commerce",
  "analytics",
  "infrastructure",
  "other",
];

const CATEGORY_LABEL = {
  "payments": "Payments",
  "communications": "Communications",
  "developer-tools": "Developer Tools",
  "cloud": "Cloud",
  "ai": "AI & ML",
  "identity": "Identity",
  "social": "Social",
  "commerce": "Commerce",
  "analytics": "Analytics",
  "infrastructure": "Infrastructure",
  "release-notes": "Release Notes",
  "other": "Other",
};

// Build slug→category from the curated domain registry. Any integration base44 returns
// that isn't in the registry falls through to "other" so it stays visible.
const SLUG_TO_CATEGORY = new Map(
  PROVIDER_REGISTRY.flatMap((p) => {
    const entries = [[p.slug.toLowerCase(), p.category]];
    if (p.name) entries.push([p.name.toLowerCase(), p.category]);
    return entries;
  }),
);

function categoryFor(integration) {
  const key = (integration.slug || integration.name || "").toLowerCase();
  return SLUG_TO_CATEGORY.get(key) || "other";
}

// Brand colors for curated providers. Falls back to stone grey when unknown —
// matches the existing integration.color fallback.
const REGISTRY_COLORS = {
  stripe: "#635BFF",
  twilio: "#F22F46",
  github: "#181717",
  azure: "#0078D4",
  "google-cloud": "#4285F4",
  openai: "#10A37F",
  "forward-networks": "#00A69C",
  cloudflare: "#F6821F",
  sendgrid: "#1A82E2",
  paypal: "#0070BA",
  okta: "#007DC1",
  slack: "#4A154B",
  discord: "#5865F2",
};

/**
 * Convert a PROVIDER_REGISTRY entry into the shape IntegrationList renders.
 * kind:'url' sources ship explicit spec URLs and map 1:1 to versions.
 * Other kinds (github, apis-guru, docusaurus) appear with empty versions —
 * the user runs discovery from /discovery to populate them, after which
 * a real Integration row from integrationStore wins by slug merge below.
 */
function registryEntryToIntegration(p) {
  const base = {
    id: `registry:${p.slug}`,
    name: p.name,
    slug: p.slug,
    category: p.category,
    color: REGISTRY_COLORS[p.slug] || "#78716c",
    logo_url: "",
    comparisons: [],
    __source: "registry",
  };
  if (p.specSource.kind === "url") {
    return { ...base, versions: p.specSource.specUrls.map((u) => ({ label: u.label, url: u.url })) };
  }
  return { ...base, versions: [] };
}

export default function IntegrationList({ selected, onSelect, initialSlug, collapsed, onToggleCollapse }) {
  const [integrations, setIntegrations] = useState([]);
  const [collapsedCats, setCollapsedCats] = useState(() => new Set());

  useEffect(() => {
    integrationStore.list().then((items) => {
      setIntegrations(items.map(item => {
        const d = item.data || item;
        return { id: item.id, ...d };
      }));
    }).catch(() => {});
  }, []);

  const FWD_VERSIONS = [
    { label: "26.3.0", from: "2026-03-17", breaking: 3, stats: { newOperations: 4, newModels: 3, modelChanges: 8 }, diff: null },
    { label: "26.2.0", from: "2026-02-17", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "26.1.0", from: "2026-01-22", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.12.0", from: "2025-12-16", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 3 }, diff: null },
    { label: "25.11.0", from: "2025-11-18", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.10.0", from: "2025-10-21", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.9.0", from: "2025-09-16", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.8.0", from: "2025-08-19", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.7.0", from: "2025-07-22", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.6.0", from: "2025-06-17", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.5.0", from: "2025-05-20", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.4.0", from: "2025-04-22", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.3.0", from: "2025-03-18", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.2.0", from: "2025-02-13", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "25.1.0", from: "2025-01-21", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.12.0", from: "2024-12-17", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.11.0", from: "2024-11-19", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.10.0", from: "2024-10-17", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.9.0", from: "2024-09-12", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.8.0", from: "2024-08-22", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.7.0", from: "2024-07-11", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.6.0", from: "2024-06-13", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.5.0", from: "2024-05-16", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.4.0", from: "2024-04-11", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.3.0", from: "2024-03-14", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.2.0", from: "2024-02-15", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "24.1.0", from: "2024-01-18", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.12.0", from: "2023-12-12", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 2 }, diff: null },
    { label: "23.11.0", from: "2023-11-14", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.10.0", from: "2023-10-19", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.9.0", from: "2023-09-21", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.8.0", from: "2023-08-23", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.7.0", from: "2023-07-20", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.6.0", from: "2023-06-20", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.5.0", from: "2023-05-24", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.4.0", from: "2023-04-20", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.3.0", from: "2023-03-23", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.2.0", from: "2023-02-22", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
    { label: "23.1.0", from: "2023-01-19", breaking: 0, stats: { newOperations: 0, newModels: 0, modelChanges: 0 }, diff: null },
  ];

  const STATIC_INTEGRATIONS = [
    {
      id: "fwdnetworks-static",
      name: fwdData.name || "Forward Networks",
      slug: "forward-networks",
      color: fwdData.color || "#FF6B35",
      logo_url: null,
      versions: fwdData.versions || [],
    },
  ];

  // Merge base44 integrations with kind:'url' registry entries. If the same slug
  // exists in both, the base44 record wins (user-editable state beats defaults).
  const mergedIntegrations = useMemo(() => {
    const bySlug = new Map();
    // First add static integrations
    for (const integ of STATIC_INTEGRATIONS) {
      const slug = (integ.slug || integ.name || "").toLowerCase();
      if (slug) bySlug.set(slug, integ);
    }
    // Then add base44 integrations (they override static)
    for (const integ of integrations) {
      const slug = (integ.slug || integ.name || "").toLowerCase();
      if (slug) bySlug.set(slug, integ);
    }
    // Finally add registry entries that don't exist yet
    for (const p of PROVIDER_REGISTRY) {
      const slug = p.slug.toLowerCase();
      if (bySlug.has(slug)) continue;
      const synthesized = registryEntryToIntegration(p);
      if (synthesized) bySlug.set(slug, synthesized);
    }
    return Array.from(bySlug.values());
  }, [integrations]);

  // Group by category, preserve the curated category order, alphabetise within each group.
  const grouped = useMemo(() => {
    const byCat = new Map();
    for (const integ of mergedIntegrations) {
      const cat = categoryFor(integ);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(integ);
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    const ordered = [];
    for (const cat of CATEGORY_ORDER) {
      if (byCat.has(cat)) ordered.push([cat, byCat.get(cat)]);
    }
    // Surface any category the registry didn't predict (defensive — shouldn't happen).
    for (const [cat, list] of byCat) {
      if (!CATEGORY_ORDER.includes(cat)) ordered.push([cat, list]);
    }
    return ordered;
  }, [mergedIntegrations]);

  // Auto-select integration from URL
  useEffect(() => {
    if (initialSlug && mergedIntegrations.length > 0 && !selected) {
      const found = mergedIntegrations.find(i => i.slug?.toLowerCase() === initialSlug.toLowerCase());
      if (found) {
        onSelect(found);
      }
    }
  }, [initialSlug, mergedIntegrations, selected, onSelect]);

  const toggleCategory = (cat) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  return (
    <motion.aside
      className={`flex flex-col border-r border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 overflow-hidden ${
        collapsed ? '' : 'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-xl'
      }`}
      animate={{ width: collapsed ? 48 : 220 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-stone-200 dark:border-stone-700">
        {!collapsed && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Integrations
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-stone-200 text-stone-400 transition-colors"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map(([cat, list]) => {
          const isCatCollapsed = collapsedCats.has(cat);
          const label = CATEGORY_LABEL[cat] || cat;
          return (
            <div key={cat} className="pb-1">
              {!collapsed && (
                <button
                  onClick={() => toggleCategory(cat)}
                  className="flex w-full items-center gap-1 px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 hover:text-stone-600 transition-colors"
                >
                  {isCatCollapsed
                    ? <ChevronRight className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />}
                  <span>{label}</span>
                  <span className="ml-auto font-mono text-[10px] text-stone-300">{list.length}</span>
                </button>
              )}
              {!isCatCollapsed && list.map((integration) => {
                const isActive = selected?.id === integration.id;
                return (
                  <button
                    key={integration.id}
                    onClick={() => onSelect(isActive ? null : integration)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-white dark:bg-stone-800 border-r-2 font-semibold text-stone-900 dark:text-stone-100"
                        : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                    }`}
                    style={isActive ? { borderRightColor: integration.color || "#666" } : {}}
                    title={collapsed ? integration.name : undefined}
                  >
                    {integration.logo_url?.trim() ? (
                      <img src={integration.logo_url} alt="" className="w-5 h-5 object-contain rounded flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: integration.color || "#888" }} />
                    )}
                    {!collapsed && <span className="truncate">{integration.name}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-stone-200 dark:border-stone-700">
        <Link
          to="/settings"
          className="flex items-center gap-2 px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-3.5 w-3.5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
    </motion.aside>
  );
}