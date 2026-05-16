import React, { useState, useEffect } from "react";
import "./TemplatesPage.css";

const API_BASE = "http://localhost:8000/api";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // NEW: Tracks which template is being edited

  const [formData, setFormData] = useState({
    label: "",
    industry: "",
    description: "",
    products: "",
    regions: ""
  });

  const fetchTemplates = () => {
    fetch(`${API_BASE}/templates`)
      .then(res => res.json())
      .then(data => setTemplates(data || []))
      .catch(err => console.error("Failed to fetch templates:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openNewModal = () => {
    setFormData({ label: "", industry: "", description: "", products: "", regions: "" });
    setEditingTemplate(null);
    setIsModalOpen(true);
  };

  const handleEdit = (t) => {
    setFormData({
      label: t.label || "",
      industry: t.industry || "",
      description: t.description || "",
      products: (t.available_dimensions?.product || []).join(', '),
      regions: (t.available_dimensions?.region || []).join(', ')
    });
    setEditingTemplate(t.industry);
    setIsModalOpen(true);
  };

  const handleDelete = async (industry) => {
    if (!window.confirm(`Are you sure you want to permanently delete the '${industry}' template?`)) return;
    try {
      const res = await fetch(`${API_BASE}/templates/${industry}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template.");
      fetchTemplates();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSave = async () => {
    if (!formData.label.trim()) return alert("Template Name is required.");
    
    // Auto-generate key if empty (only matters for new templates)
    const industryKey = formData.industry.trim() 
      ? formData.industry.toLowerCase().replace(/[^a-z0-9]/g, '_') 
      : formData.label.toLowerCase().replace(/[^a-z0-9]/g, '_');

    setSaving(true);

    const payload = {
      industry: industryKey,
      label: formData.label,
      description: formData.description,
      available_dimensions: {
        product: formData.products.split(',').map(s => s.trim()).filter(Boolean),
        region: formData.regions.split(',').map(s => s.trim()).filter(Boolean)
      },
      seasonality_profiles: { "flat": {} }, 
      inflation_presets: { "low": {}, "medium": {}, "high": {} }
    };

    // Determine if we are updating (PUT) or creating (POST)
    const method = editingTemplate ? "PUT" : "POST";
    const url = editingTemplate ? `${API_BASE}/templates/${editingTemplate}` : `${API_BASE}/templates`;

    try {
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to save template.");
      }
      
      fetchTemplates();
      setIsModalOpen(false);
      setFormData({ label: "", industry: "", description: "", products: "", regions: "" });
      setEditingTemplate(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-container">Loading templates...</div>;

  return (
    <div className="page-wrapper">
      <header className="top-navbar">
        <div className="navbar-left">
          <h2 className="navbar-title">Templates</h2>
          <span className="navbar-sub">Manage industry blueprints</span>
        </div>
        <button className="btn-primary" onClick={openNewModal}>
          + New Template
        </button>
      </header>

      <div className="dashboard-container">
        <div className="template-grid">
          {templates.map(t => (
            <div key={t.industry} className="template-card">
              <div className="card-header">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="template-tag">{(t.industry || "CUS").toUpperCase().slice(0, 4)}</span>
                  <span className="template-key-badge">{t.industry}</span>
                </div>
                <div className="card-actions">
                  <button onClick={() => handleEdit(t)} className="action-btn" title="Edit">✎</button>
                  <button onClick={() => handleDelete(t.industry)} className="action-btn danger" title="Delete">🗑</button>
                </div>
              </div>
              <h3 className="template-title">{t.label}</h3>
              <p className="template-desc">{t.description || "No description provided."}</p>
              
              <div className="template-meta">
                <div className="meta-col">
                  <span className="meta-label">Products</span>
                  <span className="meta-value">{(t.available_dimensions?.product || []).length} items</span>
                </div>
                <div className="meta-col">
                  <span className="meta-label">Regions</span>
                  <span className="meta-value">{(t.available_dimensions?.region || []).length} items</span>
                </div>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <strong>No templates found.</strong>
              <span>Create your first industry blueprint to get started.</span>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => !saving && setIsModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div>
                <h2>{editingTemplate ? "Edit Template" : "Create Industry Template"}</h2>
                <p className="modal-desc">Define base dimensions for this industry blueprint.</p>
              </div>
              <button className="modal-close-btn" onClick={() => !saving && setIsModalOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Template Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Healthcare & Pharma" 
                  value={formData.label}
                  onChange={e => setFormData(f => ({ ...f, label: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Unique Key</label>
                <input 
                  type="text" 
                  placeholder="e.g. healthcare (Auto-generated if left blank)" 
                  value={formData.industry}
                  onChange={e => setFormData(f => ({ ...f, industry: e.target.value }))}
                  disabled={!!editingTemplate} // Cannot change the unique ID once created!
                  style={{ opacity: editingTemplate ? 0.6 : 1, cursor: editingTemplate ? 'not-allowed' : 'text' }}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input 
                  type="text" 
                  placeholder="Brief description of this industry" 
                  value={formData.description}
                  onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              
              <div className="form-row-split">
                <div className="form-group">
                  <label>Default Products (Comma Separated)</label>
                  <textarea 
                    placeholder="e.g. Medical Devices, Pharmaceuticals, Consulting" 
                    value={formData.products}
                    onChange={e => setFormData(f => ({ ...f, products: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Default Regions (Comma Separated)</label>
                  <textarea 
                    placeholder="e.g. North America, EMEA, APAC" 
                    value={formData.regions}
                    onChange={e => setFormData(f => ({ ...f, regions: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setIsModalOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving || !formData.label.trim()}>
                {saving ? "Saving..." : editingTemplate ? "Update Template" : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}