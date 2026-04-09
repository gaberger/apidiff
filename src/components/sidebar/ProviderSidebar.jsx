"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Settings, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import VersionPicker from "./VersionPicker";

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
    base44.entities.Integration.list().then((items) => {
      // Normalize: SDK may return {id, data: {...}} or flat {id, name, ...}
      setDynamicProviders(items.map(item => {
        const d = item.data || item;
        return { id: item.id, ...d };
      }));
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
      versions: d.versions || [],
      comparisons: (d.comparisons || []).map((c) => ({
        label: c.label,
        v1_url: c.v1_url,
        v2_url: c.v2_url,
      })),
    };
  });

  function toggleProvider(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleComparisonClick(provider, comp) {
    const key = `${provider.id}-${comp.label}`;
    setActiveKey(key);
    const label = `${provider.name}: ${comp.label}`;

    setLoadingKey(key);
    try {
      const [r1, r2] = await Promise.all([
        comp.v1_url ? base44.functions.invoke('proxyFetch', { url: comp.v1_url }).then(r => r.data.document) : Promise.resolve(null),
        comp.v2_url ? base44.functions.invoke('proxyFetch', { url: comp.v2_url }).then(r => r.data.document) : Promise.resolve(null),
      ]);
      onSelectComparison(r1, r2, label);
    } finally {
      setLoadingKey(null);
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
                   {/* Version picker for any-to-any comparison */}
                   {provider.versions.length > 0 && (
                     <VersionPicker
                       provider={provider}
                       onSelectComparison={onSelectComparison}
                     />
                   )}

                   {/* Pre-built comparisons */}
                   {provider.comparisons.length > 0 && (
                     <div className="px-3 pl-6 pb-1">
                       <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">
                         Saved comparisons
                       </div>
                     </div>
                   )}
                   {provider.comparisons.map((comp) => {
                     const key = `${provider.id}-${comp.label}`;
                     const isActive = activeKey === key;

                     return (
                       <button
                         key={comp.label}
                         onClick={() => handleComparisonClick(provider, comp)}
                         className={`
                           flex w-full items-center gap-2 px-4 pl-9 py-1.5 text-left text-xs transition-colors
                           ${
                             isActive
                               ? "bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-indigo-500"
                               : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
                           }
                         `}
                       >
                         <span className="flex-1 truncate">{comp.label}</span>
                         {loadingKey === key && (
                           <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                         )}
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