import React, { useState, useEffect, useMemo } from "react";
import "./NewDatasetPage.css";
import { api } from "../hooks/api";

const parseSafeArray = (data) => {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try { return JSON.parse(data.replace(/'/g, '"')); } catch (e) { return []; }
  }
  return [];
};

export default function NewDatasetPage({ navigate, params }) {
  const projectId = params?.projectId;
  const industry = params?.industry || "Software as a Service";

  const [activeStep, setActiveStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  const [formData, setFormData] = useState({
    name: `Scenario_${new Date().toISOString().slice(0, 10)}`, description: "", startYear: "2024", numYears: "2", randomSeed: "42",
    seasonality_profile: "flat", inflation_preset: "medium", marketing_intensity: "1.0", sentiment_volatility: "0.15", fx_volatility: "0.05",
  });

  // --- CHANGED: allDimensions is now updatable ---
  const [allDimensions, setAllDimensions] = useState(["Region", "Product", "Channel"]);
  const [activeDimensions, setActiveDimensions] = useState(["Region", "Product", "Channel"]);
  const [newDimensionName, setNewDimensionName] = useState("");

  const [scenarios] = useState(["Base Scenario", "High Growth", "Recession"]);
  const [selectedScenarios, setSelectedScenarios] = useState(["Base Scenario"]);

  const [availableMembers, setAvailableMembers] = useState({
    Region: ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"],
    Product: ["Basic Plan", "Pro Plan", "Enterprise", "Professional Services"],
    Channel: ["Direct Sales", "Partner Network", "Online Self-Service"],
  });
  const [selectedMembers, setSelectedMembers] = useState({ Region: ["North America", "Europe"], Product: ["Enterprise", "Pro Plan"], Channel: [] });
  const [newMemberInputs, setNewMemberInputs] = useState({});

  const [accounts] = useState(["Revenue", "COGS", "Gross Profit", "Payroll", "Marketing", "SGA", "R&D", "EBITDA", "Depreciation & Amortization", "EBIT", "Net Income"]);
  const [selectedAccounts, setSelectedAccounts] = useState(["Revenue", "COGS", "Gross Profit", "Payroll", "SGA", "EBITDA", "EBIT"]);
  const [newAccountName, setNewAccountName] = useState("");

  const [memberSearch, setMemberSearch] = useState({});
  const [accountSearch, setAccountSearch] = useState("");
  const [accountSort, setAccountSort] = useState("default");
  const [memberSort, setMemberSort] = useState("default");

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then(project => {
      if (!project) return;
      const overrides = project.template_overrides || project.parameters || {};
      const customProducts = parseSafeArray(overrides.products);
      const customRegions = parseSafeArray(overrides.regions);

      if (customProducts.length > 0 || customRegions.length > 0) {
        setAvailableMembers(prev => ({
          ...prev,
          Product: Array.from(new Set([...prev.Product, ...customProducts])),
          Region: Array.from(new Set([...prev.Region, ...customRegions]))
        }));
        setSelectedMembers(prev => ({
          ...prev,
          Product: Array.from(new Set([...(prev.Product || []), ...customProducts])),
          Region: Array.from(new Set([...(prev.Region || []), ...customRegions]))
        }));
      }

      setFormData(prev => ({
        ...prev,
        seasonality_profile: Array.isArray(overrides.seasonality) ? overrides.seasonality[0] : (overrides.seasonality || prev.seasonality_profile),
        inflation_preset: Array.isArray(overrides.inflation) ? overrides.inflation[0] : (overrides.inflation || prev.inflation_preset)
      }));
    }).catch(console.error);
  }, [projectId]);

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const toggleArrayItem = (setter, item) => setter(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);

  const toggleMember = (dim, member) => setSelectedMembers(prev => {
    const current = prev[dim] || [];
    return { ...prev, [dim]: current.includes(member) ? current.filter(m => m !== member) : [...current, member] };
  });

  // --- NEW: Add a Custom Column / Dimension ---
  const handleAddDimension = () => {
    const dim = newDimensionName.trim();
    if (!dim) return;
    
    // Format perfectly (e.g. "cohort" -> "Cohort")
    const formattedDim = dim.charAt(0).toUpperCase() + dim.slice(1);

    if (!allDimensions.includes(formattedDim)) {
      setAllDimensions(prev => [...prev, formattedDim]);
      setActiveDimensions(prev => [...prev, formattedDim]);
      setAvailableMembers(prev => ({ ...prev, [formattedDim]: [] }));
      setSelectedMembers(prev => ({ ...prev, [formattedDim]: [] }));
    }
    setNewDimensionName("");
  };

  const handleAddMember = (dim) => {
    const val = newMemberInputs[dim]?.trim();
    if (val && !(availableMembers[dim] || []).includes(val)) {
      setAvailableMembers(prev => ({ ...prev, [dim]: [...(prev[dim] || []), val] }));
      toggleMember(dim, val);
      setNewMemberInputs(prev => ({ ...prev, [dim]: "" }));
    }
  };

  const handleAddAccount = () => {
    const v = newAccountName.trim();
    if (v && !accounts.includes(v) && !selectedAccounts.includes(v)) {
      setSelectedAccounts(prev => [...prev, v]);
      setNewAccountName("");
    }
  };

  const handleSelectAllMembers = (dim) => setSelectedMembers(prev => ({ ...prev, [dim]: [...(availableMembers[dim] || [])] }));
  const handleClearAllMembers = (dim) => setSelectedMembers(prev => ({ ...prev, [dim]: [] }));
  const handleSelectAllAccounts = () => setSelectedAccounts([...accounts]);
  const handleClearAllAccounts = () => setSelectedAccounts([]);
  const handleSelectAllScenarios = () => setSelectedScenarios([...scenarios]);

  const filterAndSortMembers = (members, dim) => {
    const q = (memberSearch[dim] || "").toLowerCase();
    const filtered = members.filter(m => !q || m.toLowerCase().includes(q));
    if (memberSort === "az") return [...filtered].sort((a, b) => a.localeCompare(b));
    if (memberSort === "za") return [...filtered].sort((a, b) => b.localeCompare(a));
    return filtered;
  };

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.toLowerCase();
    const filtered = accounts.filter(a => !q || a.toLowerCase().includes(q));
    if (accountSort === "az") return [...filtered].sort((a, b) => a.localeCompare(b));
    if (accountSort === "za") return [...filtered].sort((a, b) => b.localeCompare(a));
    if (accountSort === "selected") return [...filtered].sort((a, b) => {
      const aSel = selectedAccounts.includes(a) ? 0 : 1;
      const bSel = selectedAccounts.includes(b) ? 0 : 1;
      return aSel - bSel;
    });
    return filtered;
  }, [accounts, accountSearch, accountSort, selectedAccounts]);

  const handleGenerate = async () => {
    if (!formData.name.trim()) return alert("Please enter a dataset name.");
    
    // --- CHANGED: Dynamically validate all custom and core dimensions ---
    for (const dim of activeDimensions) {
      if (!selectedMembers[dim] || selectedMembers[dim].length === 0) {
        return alert(`Error: You have '${dim}' enabled as an Active Dimension, but you haven't selected any members for it. Please select at least one!`);
      }
    }
    if (selectedAccounts.length === 0) return alert("Error: You must select at least one Account item.");

    setIsGenerating(true);

    const lowercasedCustomDims = {};
    Object.keys(selectedMembers).forEach(k => { lowercasedCustomDims[k.toLowerCase()] = selectedMembers[k]; });

    const payload = {
      name: formData.name, description: formData.description,
      start_year: parseInt(formData.startYear) || 2024, num_years: Math.max(1, parseInt(formData.numYears) || 1), random_seed: parseInt(formData.randomSeed) || 42,
      dimensions: activeDimensions.map(d => d.toLowerCase()),
      scenarios: selectedScenarios.length > 0 ? selectedScenarios : ["Base Scenario"], accounts: selectedAccounts,
      seasonality_profile: formData.seasonality_profile, inflation_preset: formData.inflation_preset,
      marketing_intensity: parseFloat(formData.marketing_intensity) || 1.0, sentiment_volatility: parseFloat(formData.sentiment_volatility) || 0.15, fx_volatility: parseFloat(formData.fx_volatility) || 0.05,
      custom_dimensions: lowercasedCustomDims, products: selectedMembers["Product"] || [], regions: selectedMembers["Region"] || [], channels: selectedMembers["Channel"] || []
    };

    try {
      await api.createDataset(projectId, payload);
      navigate("project-detail", { projectId });
    } catch (error) {
      alert("Failed to generate dataset: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const steps = [
    { id: 1, title: "Core Information", desc: "Basic dataset parameters and dimensions" },
    { id: 2, title: "Dimensional Architecture", desc: "Configure dimension members" },
    { id: 3, title: "Chart of Accounts", desc: "Financial line items" },
    { id: 4, title: "Macroeconomic Parameters", desc: "Inflation and FX" },
  ];

  const renderSummaryRow = (label, value, isLast = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", paddingBottom: "10px", borderBottom: isLast ? "none" : "1px dashed #cbd5e1", marginBottom: isLast ? "0" : "10px" }}>
      <span style={{ color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "11px" }}>{label}</span>
      <strong style={{ color: "#0f172a" }}>{value}</strong>
    </div>
  );

  return (
    <div className="new-ds-wrapper">
      <div className="new-ds-header">
        <button onClick={() => navigate("project-detail", { projectId })} className="back-btn">Back to Project</button>
        <div className="header-titles">
          <h1>Configure Dataset</h1>
          <p>Progressive generation profile for {industry}.</p>
        </div>
      </div>

      <div className="new-ds-split-layout">
        <div className="steps-sidebar">
          {steps.map(step => (
            <div key={step.id}
              className={`step-nav-item ${activeStep === step.id ? "active" : ""} ${activeStep > step.id ? "completed" : ""}`}
              onClick={() => setActiveStep(step.id)}>
              <div className="step-number">{step.id}</div>
              <div className="step-text">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="form-content-area">
          {activeStep === 1 && (
            <div className="form-panel">
              <h2 className="panel-title">Step 1 — Core Information</h2>

              <div className="form-grid-2-col">
                <div className="form-group">
                  <label>Dataset Name</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input type="text" name="description" value={formData.description} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>Start Year</label>
                  <select name="startYear" value={formData.startYear} onChange={handleInputChange}>
                    <option value="2023">2023</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Number of Years</label>
                  <select name="numYears" value={formData.numYears} onChange={handleInputChange}>
                    <option value="1">1 Year</option>
                    <option value="2">2 Years</option>
                    <option value="3">3 Years</option>
                    <option value="5">5 Years</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Random Seed</label>
                  <input type="number" name="randomSeed" value={formData.randomSeed} onChange={handleInputChange} />
                </div>
              </div>

              <div className="subsection-header">
                <h4 className="section-subtitle">Active Dimensions</h4>
                <div className="subsection-actions">
                  <button className="btn-link-small" onClick={() => setActiveDimensions([...allDimensions])}>Select All</button>
                  <button className="btn-link-small" onClick={() => setActiveDimensions([])}>Clear</button>
                </div>
              </div>
              <div className="member-chip-grid">
                {allDimensions.map(dim => (
                  <button key={dim}
                    className={`member-chip ${activeDimensions.includes(dim) ? "selected" : ""}`}
                    onClick={() => toggleArrayItem(setActiveDimensions, dim)}>
                    {dim}
                  </button>
                ))}
              </div>

              {/* --- NEW: Add custom dimension input UI --- */}
              <div className="add-member-row" style={{ marginTop: 12, marginBottom: 24 }}>
                <input
                  type="text"
                  placeholder="Add custom dimension (e.g. Segment, Cohort)..."
                  value={newDimensionName}
                  onChange={(e) => setNewDimensionName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddDimension(); }}
                />
                <button className="btn-outline-small" onClick={handleAddDimension}>Add</button>
              </div>

              <div className="subsection-header" style={{ marginTop: 16 }}>
                <h4 className="section-subtitle">Active Scenarios</h4>
                <div className="subsection-actions">
                  <button className="btn-link-small" onClick={handleSelectAllScenarios}>Select All</button>
                  <button className="btn-link-small" onClick={() => setSelectedScenarios([])}>Clear</button>
                </div>
              </div>
              <div className="member-chip-grid">
                {scenarios.map(scen => (
                  <button key={scen}
                    className={`member-chip ${selectedScenarios.includes(scen) ? "selected" : ""}`}
                    onClick={() => toggleArrayItem(setSelectedScenarios, scen)}>
                    {scen}
                  </button>
                ))}
              </div>

              <div className="form-actions">
                <button className="btn-primary" onClick={() => setActiveStep(2)}>Continue</button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="form-panel">
              <h2 className="panel-title">Step 2 — Dimensional Architecture</h2>

              <div className="dim-toolbar">
                <div className="sort-group">
                  <span className="label">Sort:</span>
                  <select value={memberSort} onChange={(e) => setMemberSort(e.target.value)}>
                    <option value="default">Default</option>
                    <option value="az">A to Z</option>
                    <option value="za">Z to A</option>
                  </select>
                </div>
              </div>

              <div className="dimensions-container">
                {activeDimensions.map(dimName => {
                  const members = availableMembers[dimName] || [];
                  const selectedCount = selectedMembers[dimName]?.length || 0;
                  const visibleMembers = filterAndSortMembers(members, dimName);
                  return (
                    <div key={dimName} className="dimension-group">
                      <div className="dimension-header">
                        <h4 className="dimension-title">{dimName}</h4>
                        <div className="dimension-controls">
                          <span className={`dimension-count ${selectedCount > 0 ? "active-count" : ""}`}>{selectedCount} of {members.length} selected</span>
                          <button className="btn-link-small" onClick={() => handleSelectAllMembers(dimName)}>All</button>
                          <button className="btn-link-small" onClick={() => handleClearAllMembers(dimName)}>Clear</button>
                        </div>
                      </div>

                      <div className="dim-search">
                        <input
                          type="text"
                          placeholder={`Search ${dimName} members...`}
                          value={memberSearch[dimName] || ""}
                          onChange={(e) => setMemberSearch(prev => ({ ...prev, [dimName]: e.target.value }))}
                        />
                      </div>

                      <div className="member-chip-grid">
                        {visibleMembers.map(member => (
                          <button key={member}
                            className={`member-chip ${(selectedMembers[dimName] || []).includes(member) ? "selected" : ""}`}
                            onClick={() => toggleMember(dimName, member)}>
                            {member}
                          </button>
                        ))}
                        {visibleMembers.length === 0 && <span className="empty-inline">No members match.</span>}
                      </div>

                      <div className="add-member-row">
                        <input
                          type="text"
                          placeholder={`Add new ${dimName} member...`}
                          value={newMemberInputs[dimName] || ""}
                          onChange={(e) => setNewMemberInputs(prev => ({ ...prev, [dimName]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(dimName); }}
                        />
                        <button className="btn-outline-small" onClick={() => handleAddMember(dimName)}>Add</button>
                      </div>
                    </div>
                  );
                })}
                {activeDimensions.length === 0 && (
                  <div className="empty-state">
                    <strong>No active dimensions.</strong>
                    <span>Go back to Step 1 to enable dimensions.</span>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button className="btn-outline" onClick={() => setActiveStep(1)}>Back</button>
                <button className="btn-primary" onClick={() => setActiveStep(3)}>Continue</button>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="form-panel">
              <h2 className="panel-title">Step 3 — Chart of Accounts</h2>

              <div className="accounts-toolbar">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search accounts..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                  />
                  {accountSearch && <button className="search-clear" onClick={() => setAccountSearch("")}>Clear</button>}
                </div>
                <div className="sort-group">
                  <span className="label">Sort:</span>
                  <select value={accountSort} onChange={(e) => setAccountSort(e.target.value)}>
                    <option value="default">Default</option>
                    <option value="az">A to Z</option>
                    <option value="za">Z to A</option>
                    <option value="selected">Selected First</option>
                  </select>
                </div>
                <div className="subsection-actions">
                  <button className="btn-link-small" onClick={handleSelectAllAccounts}>Select All</button>
                  <button className="btn-link-small" onClick={handleClearAllAccounts}>Clear</button>
                </div>
                <span className="dimension-count active-count">{selectedAccounts.length} of {accounts.length} selected</span>
              </div>

              <div className="dimension-group" style={{ background: "#fff" }}>
                <div className="member-chip-grid">
                  {filteredAccounts.map(acc => (
                    <button key={acc}
                      className={`member-chip ${selectedAccounts.includes(acc) ? "selected" : ""}`}
                      onClick={() => toggleArrayItem(setSelectedAccounts, acc)}>
                      {acc}
                    </button>
                  ))}
                  {filteredAccounts.length === 0 && <span className="empty-inline">No accounts match.</span>}
                </div>

                <div className="add-member-row" style={{ marginTop: 12 }}>
                  <input
                    type="text"
                    placeholder="Add custom account..."
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddAccount(); }}
                  />
                  <button className="btn-outline-small" onClick={handleAddAccount}>Add</button>
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-outline" onClick={() => setActiveStep(2)}>Back</button>
                <button className="btn-primary" onClick={() => setActiveStep(4)}>Continue</button>
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="form-panel">
              <h2 className="panel-title">Step 4 — Macroeconomic Parameters</h2>

              <div className="form-grid-2-col">
                <div className="form-group">
                  <label>Seasonality Profile</label>
                  <select name="seasonality_profile" value={formData.seasonality_profile} onChange={handleInputChange}>
                    <option value="flat">Flat</option>
                    <option value="summer_peak">Summer Peak</option>
                    <option value="winter_peak">Winter Peak</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Inflation Preset</label>
                  <select name="inflation_preset" value={formData.inflation_preset} onChange={handleInputChange}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Marketing Intensity</label>
                  <input type="number" step="0.1" name="marketing_intensity" value={formData.marketing_intensity} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>FX Volatility</label>
                  <input type="number" step="0.01" name="fx_volatility" value={formData.fx_volatility} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>Sentiment Volatility</label>
                  <input type="number" step="0.01" name="sentiment_volatility" value={formData.sentiment_volatility} onChange={handleInputChange} />
                </div>
              </div>

              <div style={{ marginTop: "24px", padding: "20px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "800", color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Generation Summary
                </h4>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {renderSummaryRow("Name:", formData.name)}
                  {renderSummaryRow("Years:", `${formData.startYear} – ${parseInt(formData.startYear) + parseInt(formData.numYears) - 1}`)}
                  {renderSummaryRow("Scenarios:", selectedScenarios.join(', ') || 'None')}
                  {renderSummaryRow("Accounts:", selectedAccounts.length)}
                  
                  {/* --- CHANGED: Dynamically render all dimensions here! --- */}
                  {activeDimensions.length === 0 && renderSummaryRow("Dimensions:", "None", true)}
                  {activeDimensions.map((dim, idx) => (
                    <React.Fragment key={dim}>
                      {renderSummaryRow(`${dim}s:`, (selectedMembers[dim] || []).length, idx === activeDimensions.length - 1)}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-outline" onClick={() => setActiveStep(3)} disabled={isGenerating}>Back</button>
                <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? "Generating..." : "Generate Dataset"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}