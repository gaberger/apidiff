"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Settings, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// Static fallback provider data
// ---------------------------------------------------------------------------

const STATIC_PROVIDERS = [
  {
    id: "stripe",
    name: "Stripe",
    color: "#635BFF",
    icon: "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305",
    versions: [
      {
        label: "Customer schema",
        from: "2019-05-16",
        to: "2022-08-01",
        breaking: 3,
        v1: {"openapi":"3.0.0","info":{"title":"Stripe API","version":"2019-05-16"},"paths":{"/v1/customers":{"get":{"summary":"List customers","responses":{"200":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Customer"}}}}}}}},"components":{"schemas":{"Customer":{"type":"object","properties":{"id":{"type":"string"},"object":{"type":"string","enum":["customer"]},"billing":{"type":"string","enum":["charge_automatically","send_invoice"]},"account_balance":{"type":"integer"},"email":{"type":"string"},"name":{"type":"string"}},"required":["id","object","billing"]}}}},
        v2: {"openapi":"3.0.0","info":{"title":"Stripe API","version":"2022-08-01"},"paths":{"/v1/customers":{"get":{"summary":"List customers","responses":{"200":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Customer"}}}}}}}},"components":{"schemas":{"Customer":{"type":"object","properties":{"id":{"type":"string"},"object":{"type":"string","enum":["customer"]},"collection_method":{"type":"string","enum":["charge_automatically","send_invoice"]},"balance":{"type":"integer"},"email":{"type":"string"},"name":{"type":"string"}},"required":["id","object","collection_method"]}}}},
      },
    ],
  },
  {
    id: "twilio",
    name: "Twilio",
    color: "#F22F46",
    icon: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.865 16.865a1.44 1.44 0 01-2.036 0L12 14.036l-2.829 2.829a1.44 1.44 0 11-2.036-2.036L9.964 12 7.135 9.171a1.44 1.44 0 112.036-2.036L12 9.964l2.829-2.829a1.44 1.44 0 112.036 2.036L14.036 12l2.829 2.829a1.44 1.44 0 010 2.036z",
    versions: [
      {
        label: "Messages endpoint",
        from: "2010-04-01",
        to: "2024-03-01",
        breaking: 2,
        v1: {"openapi":"3.0.0","info":{"title":"Twilio Messaging","version":"2010-04-01"},"paths":{"/2010-04-01/Accounts/{AccountSid}/Messages/{Sid}.json":{"get":{"summary":"Fetch a message","parameters":[{"name":"Sid","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Message"}}}}}}}},"components":{"schemas":{"Message":{"type":"object","properties":{"sid":{"type":"string"},"body":{"type":"string"},"status":{"type":"string"},"price":{"type":"string"}},"required":["sid"]}}}},
        v2: {"openapi":"3.0.0","info":{"title":"Twilio Messaging","version":"2024-03-01"},"paths":{"/v2/Accounts/{AccountSid}/Messages/{MessageSid}.json":{"get":{"summary":"Fetch a message","parameters":[{"name":"MessageSid","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Message"}}}}}}}},"components":{"schemas":{"Message":{"type":"object","properties":{"message_sid":{"type":"string"},"body":{"type":"string"},"status":{"type":"string"},"price":{"type":"object","properties":{"amount":{"type":"number"},"currency":{"type":"string"}}}},"required":["message_sid"]}}}},
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    color: "#24292F",
    icon: "M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z",
    versions: [
      {
        label: "Users endpoint",
        from: "2022-11-28",
        to: "2024-11-14",
        breaking: 1,
        v1: {"openapi":"3.1.0","info":{"title":"GitHub REST API","version":"2022-11-28"},"paths":{"/users/{username}":{"get":{"summary":"Get a user","parameters":[{"name":"username","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/PublicUser"}}}}}}}},"components":{"schemas":{"PublicUser":{"type":"object","properties":{"login":{"type":"string"},"id":{"type":"integer"},"gravatar_id":{"type":"string"},"url":{"type":"string"},"type":{"type":"string"},"public_repos":{"type":"integer"},"followers":{"type":"integer"}},"required":["login","id"]}}}},
        v2: {"openapi":"3.1.0","info":{"title":"GitHub REST API","version":"2024-11-14"},"paths":{"/users/{username}":{"get":{"summary":"Get a user","parameters":[{"name":"username","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/PublicUser"}}}}}}}},"components":{"schemas":{"PublicUser":{"type":"object","properties":{"login":{"type":"string"},"id":{"type":"integer"},"node_id":{"type":"string"},"url":{"type":"string"},"type":{"type":"string"},"public_repos":{"type":"integer"},"followers":{"type":"integer"},"twitter_username":{"type":"string"}},"required":["login","id","node_id"]}}}},
      },
    ],
  },
];

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

  const allProviders = [
    ...STATIC_PROVIDERS,
    ...dynamicProviders.map((d) => ({
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
    })),
  ];

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
                ) : provider.logo_url ? (
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