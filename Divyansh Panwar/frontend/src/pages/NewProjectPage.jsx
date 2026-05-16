import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../hooks/api";
import { Card, Btn, Input, SectionHeader, Toast, Spinner } from "../components/UI";
import "./NewProjectPage.css";

const INDUSTRY_META = {
  cpg: { desc: "FMCG manufacturer with retail distribution" },
  saas: { desc: "Subscription software with recurring revenue" },
  retail: { desc: "Omnichannel retailer with physical and digital channels" },
};

// --- MULTI-SELECT DROPDOWN (Products & Regions) ---
function MultiSelectDropdown({ label, options = [], selected = [], onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(x => x !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const handleAdd = () => {
    const val = inputValue.trim();
    if (val && !selected.includes(val)) {
      onChange([...selected, val]);
    }
    setInputValue("");
  };

  const remove = (e, opt) => {
    e.stopPropagation();
    onChange(selected.filter(x => x !== opt));
  };

  const allOptions = Array.from(new Set([...options, ...selected]));

  return (
    <div className="tags-group" ref={dropdownRef} style={{ position: 'relative' }}>
      <div className="tags-header">
        <span className="tags-label">{label}</span>
        <span className="tags-count">{selected.length} item{selected.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="multi-select-box" onClick={() => setIsOpen(!isOpen)}>
        <div className="multi-select-chips">
          {selected.length === 0 && <span className="tags-placeholder">Select or add options...</span>}
          {selected.map(s => (
            <div key={s} className="tag-item" onClick={(e) => e.stopPropagation()}>
              <span>{s}</span>
              <button type="button" className="tag-remove-btn" onClick={(e) => remove(e, s)}>×</button>
            </div>
          ))}
        </div>
        <div className="multi-select-arrow">▼</div>
      </div>

      {isOpen && (
        <div className="multi-select-menu">
          <div className="multi-select-add-row">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Type to add new..."
              className="multi-select-add-input"
              autoFocus
            />
            <button type="button" onClick={handleAdd} className="multi-select-add-btn">Add</button>
          </div>
          <div className="multi-select-options">
            {allOptions.map(opt => (
              <label key={opt} className="multi-select-option">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- DROPDOWN ---
function SimpleDropdown({ label, value, options = [], onChange }) {
  return (
    <div className="tags-group">
      <span className="tags-label">{label}</span>
      <select
        className="config-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

export default function NewProjectPage({ navigate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", industry: "", description: "" });

  const [templateOptions, setTemplateOptions] = useState({ products: [], regions: [], seasonality: [], inflation: [] });
  const [overrides, setOverrides] = useState({ products: [], regions: [], seasonality: "flat", inflation: "medium" });
  const [toast, setToast] = useState(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateSort, setTemplateSort] = useState("name-asc");

  useEffect(() => {
    api.getTemplates()
      .then(t => { setTemplates(t); })
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectIndustry = async (indKey) => {
    setForm(f => ({ ...f, industry: indKey }));
    try {
      const templateData = await api.getTemplate(indKey);

      const safeSeasonality = templateData.seasonality_profiles ? Object.keys(templateData.seasonality_profiles) : ["flat"];
      const safeInflation = templateData.inflation_presets || templateData.inflation_curve_presets ? Object.keys(templateData.inflation_presets || templateData.inflation_curve_presets) : ["medium"];

      setTemplateOptions({
        products: templateData.available_dimensions?.product || [],
        regions: templateData.available_dimensions?.region || [],
        seasonality: safeSeasonality,
        inflation: safeInflation,
      });

      setOverrides({
        products: templateData.available_dimensions?.product || [],
        regions: templateData.available_dimensions?.region || [],
        seasonality: safeSeasonality[0],
        inflation: safeInflation[0]
      });
    } catch (e) {
      console.error("Could not load template details:", e);
    }
  };

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const submit = async () => {
    if (!form.name.trim()) return showToast("Project name required", "error");
    if (!form.industry) return showToast("Select an industry", "error");
    setSaving(true);
    try {
      const payload = { ...form, template_overrides: overrides };
      const proj = await api.createProject(payload);
      navigate("project-detail", { projectId: proj.id });
    } catch (err) {
      showToast(err.message, "error");
      setSaving(false);
    }
  };

  const visibleTemplates = useMemo(() => {
    const q = templateSearch.toLowerCase();
    const filtered = templates.filter(t => {
      if (!q) return true;
      const meta = INDUSTRY_META[t.industry] || { desc: t.description || "" };
      return (t.label || "").toLowerCase().includes(q) ||
             (t.industry || "").toLowerCase().includes(q) ||
             (meta.desc || "").toLowerCase().includes(q);
    });
    const sorted = [...filtered].sort((a, b) => {
      if (templateSort === "name-asc") return (a.label || "").localeCompare(b.label || "");
      if (templateSort === "name-desc") return (b.label || "").localeCompare(a.label || "");
      return 0;
    });
    return sorted;
  }, [templates, templateSearch, templateSort]);

  return (
    <div className="np-container">
      <button onClick={() => navigate("projects")} className="back-btn">
        ← Back to Projects
      </button>

      <SectionHeader title="Create New Project" subtitle="Choose an industry template and customize the default parameters." />

      {loading ? (
        <div className="loading-container"><Spinner /></div>
      ) : (
        <div className="form-stack">

          <div className="np-split-layout">

            {/* LEFT COLUMN */}
            <div className="np-left-col">
              <Card className="np-card">
                <div className="section-label">1. Core Information</div>
                <div className="card-stack">
                  <Input
                    label="Project Name"
                    value={form.name}
                    onChange={v => setForm(f => ({ ...f, name: v }))}
                    placeholder="e.g. Q1 2025 Planning Scenarios"
                  />
                  <Input
                    label="Description (optional)"
                    value={form.description}
                    onChange={v => setForm(f => ({ ...f, description: v }))}
                    placeholder="Brief description of this project's purpose"
                  />
                </div>
              </Card>

              <Card className="np-card">
                <div className="section-label-row">
                  <div className="section-label">2. Industry Template</div>
                  <span className="industry-count">{visibleTemplates.length} of {templates.length}</span>
                </div>
                <div className="industry-toolbar">
                  <div className="search-box">
                    <input
                      type="text"
                      placeholder="Search templates..."
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                    {templateSearch && <button className="search-clear" onClick={() => setTemplateSearch("")}>Clear</button>}
                  </div>
                  <div className="sort-group">
                    <span className="label">Sort:</span>
                    <select value={templateSort} onChange={(e) => setTemplateSort(e.target.value)}>
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                    </select>
                  </div>
                </div>
                <div className="industry-grid">
                  {visibleTemplates.map(t => {
                    const meta = INDUSTRY_META[t.industry] || { desc: t.description || "" };
                    const active = form.industry === t.industry;
                    return (
                      <button key={t.industry} onClick={() => handleSelectIndustry(t.industry)} className={`industry-card ${active ? 'active' : ''}`}>
                        <div className={`industry-tag tag-${t.industry}`}>{(t.industry || "CUS").toUpperCase().slice(0, 4)}</div>
                        <div className="industry-card-content">
                          <div className="industry-title">{t.label}</div>
                          <div className="industry-desc">{meta.desc}</div>
                        </div>
                        {active && <span className="active-marker">SELECTED</span>}
                      </button>
                    );
                  })}
                  {visibleTemplates.length === 0 && (
                    <div className="industry-empty">No templates match "{templateSearch}".</div>
                  )}
                </div>
              </Card>
            </div>

            {/* RIGHT COLUMN */}
            <div className="np-right-col">
              {form.industry ? (
                <Card className="np-card np-card-full">
                  <div className="section-label">3. Customize Template Details</div>
                  <div className="overrides-grid">
                    <MultiSelectDropdown
                      label="Available Products"
                      options={templateOptions.products}
                      selected={overrides.products}
                      onChange={(newTags) => setOverrides(o => ({ ...o, products: newTags }))}
                    />
                    <MultiSelectDropdown
                      label="Geographic Regions"
                      options={templateOptions.regions}
                      selected={overrides.regions}
                      onChange={(newTags) => setOverrides(o => ({ ...o, regions: newTags }))}
                    />
                    <SimpleDropdown
                      label="Default Seasonality Profile"
                      value={overrides.seasonality}
                      options={templateOptions.seasonality}
                      onChange={(val) => setOverrides(o => ({ ...o, seasonality: val }))}
                    />
                    <SimpleDropdown
                      label="Baseline Inflation Preset"
                      value={overrides.inflation}
                      options={templateOptions.inflation}
                      onChange={(val) => setOverrides(o => ({ ...o, inflation: val }))}
                    />
                  </div>
                </Card>
              ) : (
                <div className="empty-config">
                  <strong>Select an Industry</strong>
                  <span>Choose an industry blueprint on the left to configure its template details.</span>
                </div>
              )}
            </div>

          </div>

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={() => navigate("projects")} disabled={saving}>Cancel</button>
            <button type="button" className="btn-primary" onClick={submit} disabled={saving || !form.industry}>
              {saving ? "Creating..." : "Create Project"}
            </button>
          </div>
        </div>
      )}
      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}