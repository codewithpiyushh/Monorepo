import React, { useState, useEffect } from "react";
import { api } from "../hooks/api"; 
import "./ProjectsPage.css"; 

export default function ProjectsPage({ navigate }) {
  const [projects, setProjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("fpna_viewMode") || "grid-large";
  }); 
  const [sortParam, setSortParam] = useState("date-desc"); 
  const [openColumnMenu, setOpenColumnMenu] = useState(null); 

  useEffect(() => {
    localStorage.setItem("fpna_viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    api.listProjects()
      .then(data => setProjects(data || []))
      .catch(err => console.error("Failed to fetch projects:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e, projectId) => {
    e.stopPropagation(); 
    if(window.confirm("Are you sure you want to delete this project?")) {
      try {
        await api.deleteProject(projectId);
        setProjects(projects.filter(p => p.id !== projectId));
      } catch (err) {
        alert("Error deleting project");
      }
    }
  };

  // SAFE STRING EXTRACTOR (Prevents the crash)
  const getIndustryKey = (project) => {
    if (!project || !project.industry) return 'custom';
    if (typeof project.industry === 'string') return project.industry.toLowerCase();
    if (project.industry.name && typeof project.industry.name === 'string') return project.industry.name.toLowerCase();
    return 'custom';
  };

  const getIndustryLabel = (project) => {
    const key = getIndustryKey(project);
    if (key === 'cpg') return 'CPG';
    if (key === 'saas') return 'SaaS';
    if (key === 'retail') return 'Retail';
    return key.charAt(0).toUpperCase() + key.slice(1);
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const indKey = getIndustryKey(p);
    const matchesFilter = activeFilter === "All" || indKey === activeFilter.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortParam === "name-asc") return a.name.localeCompare(b.name);
    if (sortParam === "name-desc") return b.name.localeCompare(a.name);
    
    if (sortParam === "industry-asc") return getIndustryLabel(a).localeCompare(getIndustryLabel(b));
    if (sortParam === "industry-desc") return getIndustryLabel(b).localeCompare(getIndustryLabel(a));
    
    const datasetsA = a.datasets?.length || 0;
    const datasetsB = b.datasets?.length || 0;
    if (sortParam === "datasets-desc") return datasetsB - datasetsA;
    if (sortParam === "datasets-asc") return datasetsA - datasetsB;
    
    const dateA = new Date(a.created_at || 0);
    const dateB = new Date(b.created_at || 0);
    if (sortParam === "date-asc") return dateA - dateB;
    return dateB - dateA;
  });

  const handleSortClick = (field) => {
    if (sortParam.startsWith(field)) {
      setSortParam(sortParam.endsWith("-asc") ? `${field}-desc` : `${field}-asc`);
    } else {
      if (field === "date" || field === "datasets") setSortParam(`${field}-desc`); 
      else setSortParam(`${field}-asc`); 
    }
  };

  const columnMenus = {
    name: [ { label: "Name (A-Z)", value: "name-asc" }, { label: "Name (Z-A)", value: "name-desc" } ],
    industry: [ { label: "Industry (A-Z)", value: "industry-asc" }, { label: "Industry (Z-A)", value: "industry-desc" } ],
    datasets: [ { label: "Most Datasets", value: "datasets-desc" }, { label: "Fewest Datasets", value: "datasets-asc" } ],
    date: [ { label: "Newest First", value: "date-desc" }, { label: "Oldest First", value: "date-asc" } ]
  };

  const renderHeader = (field, label) => {
    const isMenuOpen = openColumnMenu === field;
    const isActiveSort = sortParam.startsWith(field);

    return (
      <th className={`sortable-col ${isActiveSort ? 'active-col' : ''}`}>
        <div className="th-wrapper">
          <div className="th-clickable" onClick={() => handleSortClick(field)}>{label}</div>
          <div 
            className={`th-menu-trigger ${isMenuOpen ? 'active' : ''} ${isActiveSort ? 'active-sort' : ''}`} 
            onClick={(e) => { e.stopPropagation(); setOpenColumnMenu(isMenuOpen ? null : field); }}
          >▾</div>
          {isMenuOpen && (
            <>
              <div className="menu-overlay" onClick={(e) => { e.stopPropagation(); setOpenColumnMenu(null); }} />
              <div className="header-dropdown">
                {columnMenus[field].map(opt => {
                  const isSelected = sortParam === opt.value;
                  return (
                    <div key={opt.value} className={`header-dropdown-item ${isSelected ? 'selected' : ''}`} onClick={(e) => { e.stopPropagation(); setSortParam(opt.value); setOpenColumnMenu(null); }}>
                      <div className="check-space">{isSelected && "✓"}</div>{opt.label}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </th>
    );
  };

  const uniqueIndustries = [...new Set(projects.map(p => getIndustryLabel(p)))].filter(Boolean);

  if (loading) return <div className="loading-container">Loading Workspace...</div>;

  return (
    <div className="page-wrapper">
      <header className="top-navbar">
        <h2 className="navbar-title">Synthetic Data Generator</h2>
        <button className="btn-red" onClick={(e) => { e.preventDefault(); navigate("new-project"); }}>+ New Project</button>
      </header>

      <div className="dashboard-container">
        
        <div className="kpi-grid">
          <div className="kpi-card">
            <span className="kpi-title">Total Projects</span>
            <span className="kpi-value">{projects.length}</span>
            <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: '100%', background: '#e11d48' }}></div></div>
          </div>
          <div className="kpi-card">
            <span className="kpi-title">Industries</span>
            <span className="kpi-value">{uniqueIndustries.length}</span>
            <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: '65%', background: '#3b82f6' }}></div></div>
          </div>
          <div className="kpi-card">
            <span className="kpi-title">Templates</span>
            <span className="kpi-value">12</span>
            <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: '80%', background: '#f59e0b' }}></div></div>
          </div>
        </div>

        <div className="command-bar">
          <div className="command-left">
            <div className="filter-group">
              {['All', 'CPG', 'SaaS', 'Retail'].map(filter => (
                <button key={filter} className={`filter-pill ${activeFilter === filter ? 'active' : ''}`} onClick={() => setActiveFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="sort-group" style={{ marginLeft: '12px' }}>
              <span className="label">Sort:</span>
              <select value={sortParam} onChange={(e) => setSortParam(e.target.value)}>
                <option value="date-desc">Newest First</option><option value="date-asc">Oldest First</option><option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option><option value="industry-asc">Industry (A-Z)</option><option value="industry-desc">Industry (Z-A)</option>
                <option value="datasets-desc">Most Datasets</option><option value="datasets-asc">Fewest Datasets</option>
              </select>
            </div>
          </div>

          <div className="command-right">
            <div className="search-box">
              <input type="text" placeholder="Search projects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="view-toggles">
              <button className={viewMode === 'grid-large' ? 'active' : ''} onClick={() => setViewMode('grid-large')}>⊞</button>
              <button className={viewMode === 'grid-small' ? 'active' : ''} onClick={() => setViewMode('grid-small')}>⊟</button>
              <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>☰</button>
              <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>Table</button>
            </div>
          </div>
        </div>

        <div className="view-container">
          
          {viewMode === 'table' && (
            <div className="table-wrapper">
              <table className="project-table">
                <thead>
                  <tr>
                    {renderHeader('name', 'Name')}
                    {renderHeader('industry', 'Industry')}
                    {renderHeader('datasets', 'Datasets')}
                    {renderHeader('date', 'Created At')}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.map(p => {
                    const indKey = getIndustryKey(p);
                    const indLabel = getIndustryLabel(p);
                    const dsCount = p.datasets?.length || 0;
                    return (
                      <tr key={p.id} onClick={() => navigate("project-detail", { projectId: p.id })}>
                        <td className="fw-bold">{p.name}</td>
                        <td><span className={`badge-${indKey}`}>{indLabel}</span></td>
                        <td>{dsCount} Files</td>
                        <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}</td>
                        <td><button className="icon-btn-delete" onClick={(e) => handleDelete(e, p.id)}>🗑️</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === 'list' && (
            <div className="project-list">
              {sortedProjects.map(p => {
                const indKey = getIndustryKey(p);
                const indLabel = getIndustryLabel(p);
                const icon = indKey === 'cpg' ? "🏭" : indKey === 'saas' ? "☁️" : "🛍️";
                return (
                  <div key={p.id} className="list-card" onClick={() => navigate("project-detail", { projectId: p.id })}>
                    <div className="list-icon">{icon}</div>
                    <div className="list-info">
                      <h4>{p.name}</h4>
                      <p>{p.description || "Synthetic Dataset"}</p>
                    </div>
                    <div className="list-meta">
                      <span className={`badge-${indKey}`}>{indLabel}</span>
                      <span> {p.datasets?.length || 0} Sets</span>
                      <span> {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <button className="icon-btn-delete" onClick={(e) => handleDelete(e, p.id)}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {(viewMode === 'grid-large' || viewMode === 'grid-small') && (
            <div className={`project-grid ${viewMode}`}>
              {sortedProjects.map(p => {
                const indKey = getIndustryKey(p);
                const indLabel = getIndustryLabel(p);
                const icon = indKey === 'cpg' ? "🏭" : indKey === 'saas' ? "☁️" : "🛍️";
                const scenariosList = p.scenarios?.length > 0 ? p.scenarios.map(s => s.name) : ["Base"];
                
                return (
                  <div key={p.id} className="project-card" onClick={() => navigate("project-detail", { projectId: p.id })}>
                    <div className={`card-accent-line accent-${indKey}`}></div>
                    
                    <div className="card-header">
                      <div className="card-icon-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="card-icon" style={{fontSize: '24px'}}>{icon}</div>
                        {viewMode === 'grid-large' && <span className={`badge-${indKey}`}>{indLabel}</span>}
                      </div>
                      <button className="card-delete" onClick={(e) => handleDelete(e, p.id)}>✕</button>
                    </div>
                    
                    <h3 className="card-title">{p.name}</h3>
                    {viewMode === 'grid-large' && <p className="card-desc">{p.description || "Synthetic FP&A Dataset"}</p>}

                    <div className="card-inline-details">
                      <div className="inline-stat"><span><strong>{p.datasets?.length || 0}</strong> Datasets</span></div>
                      <div className="inline-stat"><span><strong>{scenariosList.length}</strong> Scenarios</span></div>
                    </div>
                    <div className="card-metrics"><span> Created: {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}</span></div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}