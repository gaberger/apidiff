"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Settings, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";

function ProviderIcon({ path, color }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-shrink-0">
      <path d={path} fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ProviderSidebar
// ---------------------------------------------------------------------------

export default function ProviderSidebar({
  onSelectComparison,
  collapsed,
  onToggleCollapse,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [dynamicProviders, setDynamicProviders] = useState([]);
  const [loadingKey, setLoadingKey] = useState(null);

  useEffect(() => {
    base44.entities.Integration.list().then((data) => {
      setDynamicProviders(data);
    }).catch(() => {});
  }, []);

  const allProviders = dynamicProviders.map((d) => {
    return {
      id: d.id,
      name: d.name,
      color: d.color || "#888",
      icon: null,
      dynamic: true,
      logo_url: d.logo_url || null,
      versions: (d.comparisons || []).map((c) => ({
        label: c.label,
        from: c.v1_url ? "v1" : "—",
        to: c.v2_url ? "v2" : "—",
        breaking: 0,
        v1_url: c.v1_url,
        v2_url: c.v2_url,
      })),
    };
  });

  function toggleProvider(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleVersionClick(provider, version) {
    const key = `${provider.id}-${version.label}`;
    setActiveKey(key);
    const label = `${provider.name} ${version.label} (${version.from} \u2192 ${version.to})`;

    if (version.v1_url || version.v2_url) {
      setLoadingKey(key);
      try {
        const [r1, r2] = await Promise.all([
          version.v1_url ? base44.functions.invoke('proxyFetch', { url: version.v1_url }).then(r => r.data.document) : Promise.resolve(version.v1),
          version.v2_url ? base44.functions.invoke('proxyFetch', { url: version.v2_url }).then(r => r.data.document) : Promise.resolve(version.v2),
        ]);
        onSelectComparison(r1, r2, label);
      } finally {
        setLoadingKey(null);
      }
    } else {
      onSelectComparison(version.v1, version.v2, label);
    }
  }

  return (
    <motion.aside
      className="flex flex-col border-r border-stone-200 bg-stone-100 overflow-hidden"
      animate={{ width: collapsed ? 48 : 260 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-stone-200">
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Integrations
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-stone-200 text-stone-500 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Scrollable provider list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-stone-300">
        {!collapsed && (
          <p className="px-4 py-2 text-[11px] leading-snug text-stone-400">
            Based on documented migration patterns. Load real specs via URL for
            exact diffs.
          </p>
        )}

        {allProviders.map((provider) => {
          const isExpanded = expandedId === provider.id;

          return (
            <div key={provider.id} className="mb-0.5">
              {/* Provider header */}
              <button
                onClick={() => !collapsed && toggleProvider(provider.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-stone-200/70 transition-colors"
                style={{
                  borderLeft: `3px solid ${provider.color}`,
                }}
                title={collapsed ? provider.name : undefined}
              >
                {provider.icon ? (
                   <ProviderIcon path={provider.icon} color={provider.color} />
                 ) : provider.logo_url && provider.logo_url.trim() ? (
                   <img src={provider.logo_url} alt={provider.name} className="w-[18px] h-[18px] object-contain rounded flex-shrink-0" />
                 ) : (
                   <div className="w-[18px] h-[18px] rounded-full flex-shrink-0" style={{ background: provider.color }} />
                 )}
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{provider.name}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                    )}
                  </>
                )}
              </button>

              {/* Version list (animated) */}
              <AnimatePresence initial={false}>
                {isExpanded && !collapsed && (
                  <motion.div
                    key="versions"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    {provider.versions.map((version) => {
                      const key = `${provider.id}-${version.label}`;
                      const isActive = activeKey === key;

                      return (
                        <button
                          key={version.label}
                          onClick={() => handleVersionClick(provider, version)}
                          className={`
                            flex w-full items-center gap-2 px-4 pl-9 py-1.5 text-left text-xs transition-colors
                            ${
                              isActive
                                ? "bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-indigo-500"
                                : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
                            }
                          `}
                        >
                          <span className="flex-1 truncate">
                            {version.from}{" "}
                            <span className="text-stone-400">&rarr;</span>{" "}
                            {version.to}
                          </span>
                          {loadingKey === `${provider.id}-${version.label}` ? (
                            <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                          ) : version.breaking > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-100 text-red-600 text-[10px] font-bold px-1">
                              {version.breaking}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {/* Settings link */}
        {!collapsed && (
          <div className="border-t border-stone-200 mt-auto">
            <Link
              to="/settings"
              className="flex items-center gap-2 px-3 py-2.5 text-xs text-stone-500 hover:bg-stone-200/70 hover:text-stone-700 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Manage integrations
            </Link>
          </div>
        )}
      </div>
    </motion.aside>
  );
}