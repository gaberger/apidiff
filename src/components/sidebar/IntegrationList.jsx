import { useState, useEffect, useMemo } from "react";
import { PanelLeftClose, PanelLeft, Settings, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { PROVIDER_REGISTRY } from "@/lib/domain/provider-registry.js";

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

export default function IntegrationList({ selected, onSelect, collapsed, onToggleCollapse }) {
  const [integrations, setIntegrations] = useState([]);
  const [collapsedCats, setCollapsedCats] = useState(() => new Set());

  useEffect(() => {
    base44.entities.Integration.list().then((items) => {
      setIntegrations(items.map(item => {
        const d = item.data || item;
        return { id: item.id, ...d };
      }));
    }).catch(() => {});
  }, []);

  // Group by category, preserve the curated category order, alphabetise within each group.
  const grouped = useMemo(() => {
    const byCat = new Map();
    for (const integ of integrations) {
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
  }, [integrations]);

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
      {!collapsed && (
        <div className="border-t border-stone-200">
          <Link
            to="/settings"
            className="flex items-center gap-2 px-3 py-2.5 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Manage
          </Link>
        </div>
      )}
    </motion.aside>
  );
}