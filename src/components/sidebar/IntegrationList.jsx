import { useState, useEffect } from "react";
import { PanelLeftClose, PanelLeft, Settings, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";

export default function IntegrationList({ selected, onSelect, collapsed, onToggleCollapse }) {
  const [integrations, setIntegrations] = useState([]);

  useEffect(() => {
    base44.entities.Integration.list().then((items) => {
      setIntegrations(items.map(item => {
        const d = item.data || item;
        return { id: item.id, ...d };
      }));
    }).catch(() => {});
  }, []);

  return (
    <motion.aside
      className={`flex flex-col border-r border-stone-200 bg-stone-50 overflow-hidden ${
        collapsed ? '' : 'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-xl'
      }`}
      animate={{ width: collapsed ? 48 : 220 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-stone-200">
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
        {integrations.map((integration) => {
          const isActive = selected?.id === integration.id;
          return (
            <button
              key={integration.id}
              onClick={() => onSelect(isActive ? null : integration)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? "bg-white border-r-2 font-semibold text-stone-900"
                  : "text-stone-600 hover:bg-stone-100"
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