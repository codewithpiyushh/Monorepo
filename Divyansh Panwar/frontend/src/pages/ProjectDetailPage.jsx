import React, { useState, useEffect, useMemo } from "react";
import { api } from "../hooks/api";
import "./ProjectDetailPage.css";
import DatasetDashboard from './DatasetDashboard';
const API_BASE = "http://localhost:8000/api";

export default function ProjectDetailPage({ navigate, params }) {
  const { projectId } = params || {};
  const [project, setProject] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDataset, setExpandedDataset] = useState(null);

  const [codeModal, setCodeModal] = useState({ isOpen: false, code: "" });
const [savingCode, setSavingCode] = useState(false);
  // Search & sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortParam, setSortParam] = useState("date-desc");
  const [statusFilter, setStatusFilter] = useState("All");

  // File-level search/sort within an expanded dataset
  const [fileSearch, setFileSearch] = useState("");
  const [fileSort, setFileSort] = useState("name-asc");

  // Modals state
  const [paramsModal, setParamsModal] = useState({ isOpen: false, params: {} });
  const [advModal, setAdvModal] = useState({ isOpen: false, datasetId: null, fileName: null, schema: [], selectedColumns: [], filters: {} });
  const [advColSearch, setAdvColSearch] = useState("");
  
  // NEW: State to track which dataset dashboard is currently open
  const [activeDashboardDatasetId, setActiveDashboardDatasetId] = useState(null);

  const fetchDatasets = () => {
    fetch(`${API_BASE}/projects/${projectId}/datasets`)
      .then(res => res.json())
      .then(setDatasets)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then(setProject).catch(console.error);
    fetchDatasets();
  }, [projectId]);

  const toggleDataset = (id) => {
    setExpandedDataset(expandedDataset === id ? null : id);
    setFileSearch("");
  };

  const handleDeleteDataset = async (e, datasetId) => {
    e.stopPropagation();
    if (!window.confirm("Permanently delete this dataset and all its files?")) return;

    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/datasets/${datasetId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Server failed to delete dataset.");
      }
      setDatasets(datasets.filter(d => d.id !== datasetId));
      if (expandedDataset === datasetId) setExpandedDataset(null);
    } catch (err) {
      alert("Error deleting dataset: " + err.message);
    }
  };

  const openCodeEditor = async () => {
     try {
       const res = await fetch(`${API_BASE}/projects/${projectId}/custom-logic`);
       const data = await res.json();
       setCodeModal({ isOpen: true, code: data.code });
     } catch (err) {
       console.error("Failed to load custom logic");
     }
   };

   const saveCustomCode = async () => {
     setSavingCode(true);
     try {
       await fetch(`${API_BASE}/projects/${projectId}/custom-logic`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ code: codeModal.code })
       });
       setCodeModal(p => ({ ...p, isOpen: false }));
     } catch (err) {
       alert("Failed to save custom logic");
     } finally {
       setSavingCode(false);
     }
   };
  const getFileMeta = (filename) => {
    if (filename.includes('fact')) return { tag: 'FACT', desc: 'Full dataset fact table' };
    if (filename.includes('dim_time')) return { tag: 'DIM', desc: 'Time definitions' };
    if (filename.includes('dim_')) return { tag: 'DIM', desc: 'Dimension reference' };
    if (filename.includes('pnl')) return { tag: 'PNL', desc: 'Consolidated P&L' };
    if (filename.includes('custom')) return { tag: 'CUSTOM', desc: 'Custom saved slice' };
    return { tag: 'CSV', desc: 'Data file' };
  };

  const handleDownloadSingle = (datasetId, fileName) => {
    window.location.href = `${API_BASE}/projects/${projectId}/datasets/${datasetId}/download?file=${fileName}`;
  };

  const handleDownloadAll = (e, datasetId) => {
    e.stopPropagation();
    window.location.href = `${API_BASE}/projects/${projectId}/datasets/${datasetId}/download-all`;
  };

  // === Filter + sort datasets ===
  const filteredDatasets = useMemo(() => {
    return datasets.filter(d => {
      const q = searchQuery.toLowerCase();
      const nameMatch = (d.name || "").toLowerCase().includes(q);
      const matchesSearch = !q || nameMatch;
      const matchesStatus = statusFilter === "All" || (d.status || "").toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [datasets, searchQuery, statusFilter]);

  const sortedDatasets = useMemo(() => {
    return [...filteredDatasets].sort((a, b) => {
      if (sortParam === "name-asc") return (a.name || "").localeCompare(b.name || "");
      if (sortParam === "name-desc") return (b.name || "").localeCompare(a.name || "");
      if (sortParam === "rows-desc") return (b.total_row_count || 0) - (a.total_row_count || 0);
      if (sortParam === "rows-asc") return (a.total_row_count || 0) - (b.total_row_count || 0);
      const dA = new Date(a.created_at || 0);
      const dB = new Date(b.created_at || 0);
      if (sortParam === "date-asc") return dA - dB;
      return dB - dA;
    });
  }, [filteredDatasets, sortParam]);

  // === Quick Slice Modal ===
  const openAdvancedFilter = async (datasetId, fileName) => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/datasets/${datasetId}/files/${fileName}/advanced-schema`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Could not read file structure.");
      }
      const data = await res.json();
      if (data && Array.isArray(data.schema)) {
        setAdvModal({ isOpen: true, datasetId, fileName, schema: data.schema, selectedColumns: data.schema.map(s => String(s.column)), filters: {} });
        setAdvColSearch("");
      }
    } catch (err) { alert(err.message); }
  };

  const toggleModalColumn = (col) => {
    setAdvModal(p => {
      const isSelected = p.selectedColumns.includes(col);
      const newCols = isSelected ? p.selectedColumns.filter(c => c !== col) : [...p.selectedColumns, col];
      let newFilters = { ...p.filters };
      if (!isSelected) {
        const members = p.schema.find(s => s.column === col)?.members || [];
        if (members.length > 0 && !newFilters[col]) newFilters[col] = members;
      } else { delete newFilters[col]; }
      return { ...p, selectedColumns: newCols, filters: newFilters };
    });
  };

  const addModalFilter = (colName) => { if (!colName) return; const allMembers = advModal.schema.find(s => s.column === colName)?.members || []; setAdvModal(p => ({ ...p, filters: { ...p.filters, [colName]: allMembers } })); };
  const removeModalFilter = (colName) => setAdvModal(p => { const newFilters = { ...p.filters }; delete newFilters[colName]; return { ...p, filters: newFilters }; });
  const toggleModalMember = (colName, member) => setAdvModal(p => { const current = p.filters[colName] || []; const updated = current.includes(member) ? current.filter(m => m !== member) : [...current, member]; return { ...p, filters: { ...p.filters, [colName]: updated } }; });
  const setAllModalMembers = (colName, members) => setAdvModal(p => ({ ...p, filters: { ...p.filters, [colName]: members } }));
  const clearAllModalMembers = (colName) => setAdvModal(p => ({ ...p, filters: { ...p.filters, [colName]: [] } }));

  const executeAdvancedModalDownload = async () => {
    if (advModal.selectedColumns.length === 0) return alert("Select at least one column.");
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/datasets/${advModal.datasetId}/files/${advModal.fileName}/advanced-download`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_columns: advModal.selectedColumns, filters: advModal.filters })
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.detail || "Failed to slice data."); }
      const blob = await response.blob(); const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `custom_${advModal.fileName}`;
      document.body.appendChild(a); a.click(); a.remove(); setAdvModal({ ...advModal, isOpen: false });
    } catch (err) { alert(`Slice Error: ${err.message}`); }
  };

  if (loading) return <div className="loading-container">Loading project...</div>;

  const allStatuses = ["All", ...new Set(datasets.map(d => (d.status || "").toUpperCase()).filter(Boolean))];
  const filteredAdvSchema = advModal.schema.filter(s => String(s.column).toLowerCase().includes(advColSearch.toLowerCase()));

  return (
    <div className="pd-wrapper">
      <header className="pd-header">
        <button onClick={() => navigate("projects")} className="back-btn">← Back to Projects</button>
        <div className="pd-header-flex">
          <div className="pd-title-group">
            <h1>{project?.name || "Project"}</h1>
            {project?.industry && (
              <span className={`badge badge-${(typeof project.industry === 'string' ? project.industry : project.industry.name || 'custom').toLowerCase().replace(/\s+/g, '-')}`}>
                {typeof project.industry === 'string' ? project.industry : project.industry.name}
              </span>
            )}
          </div>
          <div className="pd-header-flex" style={{ gap: '12px' }}>
            <button className="btn-outline" onClick={openCodeEditor} style={{ borderColor: '#818cf8', color: '#818cf8', fontWeight: 600 }}>
              {'{ }'} Edit Core Logic
            </button>
            <button className="btn-primary" onClick={(e) => { e.preventDefault(); navigate("new-dataset", { projectId: project?.id || projectId }); }}>
              Generate Dataset
            </button>
          </div>
        </div>
      </header>

      <div className="pd-content">

        <div className="pd-toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search datasets by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>Clear</button>}
            </div>
            <div className="filter-group">
              {allStatuses.map(s => (
                <button key={s}
                  className={`filter-pill ${statusFilter === s ? 'active' : ''}`}
                  onClick={() => setStatusFilter(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar-right">
            <div className="sort-group">
              <span className="label">Sort:</span>
              <select value={sortParam} onChange={(e) => setSortParam(e.target.value)}>
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="rows-desc">Most Rows</option>
                <option value="rows-asc">Fewest Rows</option>
              </select>
            </div>
          </div>
        </div>

        <div className="result-summary">
          Showing <strong>{sortedDatasets.length}</strong> of <strong>{datasets.length}</strong> datasets
          {searchQuery && <> matching "<strong>{searchQuery}</strong>"</>}
        </div>

        {datasets.length === 0 ? (
          <div className="empty-state">
            <strong>No datasets yet.</strong>
            <span>Click "Generate Dataset" to create your first synthetic dataset.</span>
          </div>
        ) : sortedDatasets.length === 0 ? (
          <div className="empty-state">
            <strong>No datasets match your filters.</strong>
            <span>Adjust the search or status filter.</span>
          </div>
        ) : (
          <div className="dataset-list">
            {sortedDatasets.map(ds => {
              const isExpanded = expandedDataset === ds.id;
              const p = ds.params || {};
              const files = ds.files || [];

              const filteredFiles = files
                .filter(f => f.toLowerCase().includes(fileSearch.toLowerCase()))
                .sort((a, b) => {
                  if (fileSort === 'name-asc') return a.localeCompare(b);
                  if (fileSort === 'name-desc') return b.localeCompare(a);
                  return 0;
                });

              return (
                <div key={ds.id} className={`dataset-card ${isExpanded ? 'expanded-card' : ''}`}>
                  <div className="dataset-header-row" onClick={() => toggleDataset(ds.id)}>
                    <div className="ds-tag-box">DS</div>
                    <div className="ds-info">
                      <h3>{ds.name}</h3>
                      <p className="ds-meta">{ds.total_row_count?.toLocaleString() || 0} rows • {new Date(ds.created_at).toLocaleString()}</p>
                    </div>

                    <div className="ds-controls">
                      <span className={`status-badge ${(ds.status || "").toLowerCase()}`}>{(ds.status || "").toUpperCase()}</span>
                      <button
                        className="btn-link"
                        onClick={(e) => { e.stopPropagation(); toggleDataset(ds.id); }}>
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                      <button
                        className="btn-link danger"
                        onClick={(e) => handleDeleteDataset(e, ds.id)}>
                        Delete
                      </button>
                      <button
                        className="btn-link primary-link"
                        title="Download Entire Dataset (ZIP)"
                        style={{ display: 'flex', alignItems: 'center', padding: '6px 8px' }}
                        onClick={(e) => handleDownloadAll(e, ds.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="dataset-expanded-content">
                      <div className="expanded-toolbar">
                        <h4 className="section-heading">Generated Files</h4>
                        <div className="expanded-actions">
                          {/* NEW: View Analytics Dashboard Button */}
                          <button className="btn-outline-small" style={{ borderColor: '#e11d48', color: '#e11d48' }} onClick={() => setActiveDashboardDatasetId(ds.id)}>
                            📊 View Analytics
                          </button>

                          <button className="btn-outline-small" onClick={() => setParamsModal({ isOpen: true, params: p })}>
                            View Parameters
                          </button>
                          <button 
                            className="btn-outline-small" 
                            onClick={(e) => { 
                              e.preventDefault(); 
                              navigate("new-dataset", { projectId: project?.id || projectId, datasetId: ds.id }); 
                            }}
                          >
                            Configure & Recompute
                          </button>
                        </div>
                      </div>

                      <div className="files-toolbar">
                        <div className="search-box">
                          <input
                            type="text"
                            placeholder="Search files..."
                            value={fileSearch}
                            onChange={(e) => setFileSearch(e.target.value)}
                          />
                          {fileSearch && <button className="search-clear" onClick={() => setFileSearch("")}>Clear</button>}
                        </div>
                        <div className="sort-group">
                          <span className="label">Sort:</span>
                          <select value={fileSort} onChange={(e) => setFileSort(e.target.value)}>
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                          </select>
                        </div>
                      </div>

                      <div className="file-cards-grid">
                        {filteredFiles.map(file => {
                          const meta = getFileMeta(file);
                          return (
                            <div key={file} className="file-card-interactive">
                              <div className="file-card-main" onClick={() => handleDownloadSingle(ds.id, file)}>
                                <span className={`file-tag tag-${meta.tag.toLowerCase()}`}>{meta.tag}</span>
                                <div className="file-card-text">
                                  <h5>{file}</h5>
                                  <p>{meta.desc}</p>
                                </div>
                              </div>
                              <div className="file-card-actions">
                                <button className="btn-link" onClick={(e) => { e.stopPropagation(); handleDownloadSingle(ds.id, file); }}>
                                  Download
                                </button>
                                {file.endsWith('.csv') && !file.includes('custom') && (
                                  <button className="btn-link primary-link" onClick={() => openAdvancedFilter(ds.id, file)}>
                                    Quick Slice
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {filteredFiles.length === 0 && (
                          <div className="empty-state inline-empty">
                            <span>No files match "{fileSearch}".</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* === Parameters Modal === */}
      {paramsModal.isOpen && (
        <div className="modal-overlay" onClick={() => setParamsModal({ isOpen: false, params: {} })}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <div>
                <h2>Generation Parameters</h2>
                <p className="modal-desc">Settings used to mathematically generate this dataset.</p>
              </div>
              <button className="modal-close-btn" onClick={() => setParamsModal({ isOpen: false, params: {} })}>×</button>
            </div>

            <div className="params-table">
              <div className="params-table-row">
                <div className="params-table-label">Years</div>
                <div className="params-table-value">{paramsModal.params.start_year} - {parseInt(paramsModal.params.start_year) + parseInt(paramsModal.params.num_years) - 1}</div>
              </div>
              <div className="params-table-row">
                <div className="params-table-label">Seasonality Profile</div>
                <div className="params-table-value" style={{ textTransform: 'capitalize' }}>{paramsModal.params.seasonality_profile}</div>
              </div>
              <div className="params-table-row">
                <div className="params-table-label">Inflation Preset</div>
                <div className="params-table-value" style={{ textTransform: 'capitalize' }}>{paramsModal.params.inflation_preset}</div>
              </div>
              <div className="params-table-row">
                <div className="params-table-label">Marketing Intensity</div>
                <div className="params-table-value">{paramsModal.params.marketing_intensity}x Multiplier</div>
              </div>
              <div className="params-table-row">
                <div className="params-table-label">Sentiment Volatility</div>
                <div className="params-table-value">σ = {paramsModal.params.sentiment_volatility}</div>
              </div>
              <div className="params-table-row">
                <div className="params-table-label">FX Volatility</div>
                <div className="params-table-value">{Math.round(paramsModal.params.fx_volatility * 100)}%</div>
              </div>
              {paramsModal.params.dimensions && (
                <div className="params-table-row">
                  <div className="params-table-label">Active Dimensions</div>
                  <div className="params-table-value">{paramsModal.params.dimensions.join(', ')}</div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-outline-small" onClick={() => setParamsModal({ isOpen: false, params: {} })}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* === Quick Slice Modal === */}
      {advModal.isOpen && (
        <div className="modal-overlay" onClick={() => setAdvModal({ ...advModal, isOpen: false })}>
          <div className="modal-box-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Quick Data Slicer</h2>
                <p className="modal-desc">Configure exactly what columns and row members to export for <strong>{advModal.fileName}</strong></p>
              </div>
              <button className="modal-close-btn" onClick={() => setAdvModal({ ...advModal, isOpen: false })}>×</button>
            </div>

            <div className="advanced-modal-split">
              <div className="advanced-modal-left">
                <div className="pane-header">
                  <h4 className="pane-title">1. Columns to Export</h4>
                  <div className="slicer-quick-actions">
                    <button onClick={() => setAdvModal(p => {
                      const allCols = p.schema.map(s => String(s.column));
                      const allFilters = {};
                      p.schema.forEach(s => { if (s.members && s.members.length > 0) allFilters[s.column] = s.members; });
                      return { ...p, selectedColumns: allCols, filters: allFilters };
                    })}>Select All</button>
                    <span className="divider-dot">|</span>
                    <button onClick={() => setAdvModal(p => ({ ...p, selectedColumns: [], filters: {} }))}>Clear All</button>
                  </div>
                </div>
                <div className="search-box small">
                  <input
                    type="text"
                    placeholder="Search columns..."
                    value={advColSearch}
                    onChange={(e) => setAdvColSearch(e.target.value)}
                  />
                </div>
                <div className="column-checkbox-list">
                  {filteredAdvSchema.map(s => (
                    <label key={s.column} className="col-checkbox">
                      <input type="checkbox"
                        checked={advModal.selectedColumns.includes(String(s.column))}
                        onChange={() => toggleModalColumn(s.column)} />
                      <span>{String(s.column)}</span>
                    </label>
                  ))}
                  {filteredAdvSchema.length === 0 && <div className="inline-empty-msg">No columns match.</div>}
                </div>
              </div>
              <div className="advanced-modal-right">
                <h4 className="pane-title">2. Row Filters</h4>
                <select className="filter-dropdown" value="" onChange={e => addModalFilter(e.target.value)}>
                  <option value="" disabled>+ Add Column Filter...</option>
                  {advModal.schema.filter(s => s.members && s.members.length > 0 && !advModal.filters[s.column]).map(s => (
                    <option key={s.column} value={s.column}>Filter by: {String(s.column)}</option>
                  ))}
                </select>
                <div className="active-filters-container">
                  {Object.entries(advModal.filters).map(([col, activeMembers]) => {
                    const allMembers = advModal.schema.find(s => s.column === col)?.members || [];
                    return (
                      <div key={col} className="filter-block">
                        <div className="filter-block-header">
                          <span className="filter-col-name">{col}</span>
                          <div className="filter-quick-actions">
                            <button onClick={() => setAllModalMembers(col, allMembers)}>All</button>
                            <button onClick={() => clearAllModalMembers(col)}>Clear</button>
                            <button className="remove-filter-btn" onClick={() => removeModalFilter(col)}>×</button>
                          </div>
                        </div>
                        <div className="chip-grid">
                          {allMembers.map(m => {
                            const isSelected = activeMembers.includes(m);
                            return (
                              <button key={m} className={`member-chip ${isSelected ? 'selected' : ''}`} onClick={() => toggleModalMember(col, m)}>
                                {String(m)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(advModal.filters).length === 0 && <div className="empty-filters-msg">No row filters applied. All rows will be exported.</div>}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-outline-small" onClick={() => handleDownloadSingle(advModal.datasetId, advModal.fileName)}>Download Raw File</button>
              <button className="btn-primary" onClick={executeAdvancedModalDownload}>Export Custom CSV</button>
            </div>
          </div>
        </div>
      )}

      {/* === DASHBOARD MODAL === */}
      {activeDashboardDatasetId && (
        <div className="modal-overlay" onClick={() => setActiveDashboardDatasetId(null)}>
          <div 
            className="modal-box" 
            onClick={e => e.stopPropagation()} 
            style={{ maxWidth: '1200px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-header">
              <div>
                <h2>Dataset Analytics</h2>
                <p className="modal-desc">Visualizing your synthetic FP&A generation.</p>
              </div>
              <button className="modal-close-btn" onClick={() => setActiveDashboardDatasetId(null)}>×</button>
            </div>
            
            <div className="modal-body" style={{ padding: '0 24px 24px 24px' }}>
              {/* Pass the project and dataset IDs down to the component to fetch the data */}
              <DatasetDashboard 
                projectId={projectId || project?.id} 
                datasetId={activeDashboardDatasetId} 
              />
            </div>
          </div>
        </div>
      )}
{/* === CUSTOM CODE EDITOR MODAL === */}
      {codeModal.isOpen && (
        <div className="modal-overlay" onClick={() => setCodeModal({ isOpen: false, code: "" })}>
          {/* UPDATED: Increased maxWidth to 1200px and width to 95% */}
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '1200px', width: '95%' }}>
            <div className="modal-header">
              <div>
                <h2>{'{ }'} Project Generation Logic</h2>
                <p className="modal-desc">
                  Write custom Python logic using Pandas. The base dataset is loaded as a DataFrame named <code>df</code>. 
                  This runs immediately after generation.
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setCodeModal({ isOpen: false, code: "" })}>×</button>
            </div>
            
            <div className="modal-body" style={{ padding: '0 24px 24px' }}>
              <textarea
                value={codeModal.code}
                onChange={(e) => setCodeModal({ ...codeModal, code: e.target.value })}
                spellCheck="false"
                style={{
                  // UPDATED: Changed height from 400px to 65vh (65% of screen height)
                  width: '100%', height: '65vh', backgroundColor: '#1e293b', color: '#f8fafc',
                  fontFamily: '"Fira Code", "Courier New", monospace', fontSize: '14px',
                  padding: '16px', borderRadius: '8px', border: '1px solid #475569',
                  lineHeight: '1.5', resize: 'vertical', outline: 'none'
                }}
              />
            </div>

            <div className="modal-actions" style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
              <button className="btn-outline-small" onClick={() => setCodeModal({ isOpen: false, code: "" })}>Cancel</button>
              <button className="btn-primary" onClick={saveCustomCode} disabled={savingCode}>
                {savingCode ? "Saving..." : "Save & Apply to Future Datasets"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}