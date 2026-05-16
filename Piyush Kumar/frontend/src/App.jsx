import { useEffect, useMemo, useState, useRef } from 'react'
import './App.css'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

// ─── File Previewer (max 10 rows, scrollable) ────────────────────────────────

function FilePreviewer({ fileName }) {
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!fileName) return;
    const fetchPreview = async () => {
      setLoading(true); setErr('');
      try {
        const res = await fetch(`${API_BASE}/api/preview?file_name=${encodeURIComponent(fileName)}`);
        if (!res.ok) throw new Error('Preview Error');
        const payload = await res.json();
        
        // Match the 'preview' key from the backend
        const data = payload.preview || []; 
        if (data.length > 0) {
          setHeaders(Object.keys(data[0]));
          setRows(data);
        }
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [fileName]);

  if (loading) return <p className="muted">Loading preview...</p>;
  if (err) return <p className="error">{err}</p>;

  return (
    <div className="table-wrap" style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '11px' }}>
      <table>
        <thead>
          <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {headers.map(h => <td key={h}>{row[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ─── Model Evaluation Table ──────────────────────────────────────────────────
function ModelEvaluationTable({ metrics }) {
  if (!metrics || metrics.length === 0) return null;
  const cols = Object.keys(metrics[0]);

  const getBadge = (col, val) => {
    const n = parseFloat(val);
    if (col.toLowerCase().includes('r2') || col.toLowerCase().includes('r_squared')) {
      if (n >= 0.9) return '#2da44e';
      if (n >= 0.7) return '#f0883e';
      return '#f44336';
    }
    return null;
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ color: '#e0e0e0', marginBottom: 10, fontWeight: 700 }}>
        📊 Model Evaluation
      </h4>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #2d2d4e' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} style={{
                  padding: '10px 16px', background: '#0f0f23', color: '#00bcd4',
                  textAlign: 'left', borderBottom: '1px solid #2d2d4e', whiteSpace: 'nowrap'
                }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#1a1a2e' : '#14142a' }}>
                {cols.map(c => {
                  const badge = getBadge(c, row[c]);
                  return (
                    <td key={c} style={{
                      padding: '8px 16px', color: '#ddd',
                      borderBottom: '1px solid #22223a'
                    }}>
                      {badge ? (
                        <span style={{
                          background: badge, color: '#fff',
                          borderRadius: 4, padding: '2px 8px', fontWeight: 700
                        }}>{String(row[c] ?? '')}</span>
                      ) : String(row[c] ?? '')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Add '#' to the codes you provided to make them valid hex strings
const MODEL_COLORS = {
  RandomForest: '#6c757d',      // Slate Grey
  GradientBoosting: '#343a40',  // Dark Gunmetal 
  SVR: '#495057',               // Steel Grey
};
// ─── Interactive Prediction Graph ─────────────────────────────────────────────
// Shows actual data up to click point, then predictions after
function InteractivePredictionGraph({ pointsData, predictionData, selectedModels }) {
  const [splitIndex, setSplitIndex] = useState(null);

  const allData = useMemo(() => {
    if (!pointsData || pointsData.length === 0) return [];
    
    // 1. COMBINE AND SORT: This fixes the "zigzag" issue
    const merged = pointsData.map((row, i) => {
      const predRow = predictionData ? predictionData[i] : null;
      return {
        sortKey: Number(row.year) * 100 + Number(row.month), // Create numeric YYYYMM for sorting
        label: `${row.year}-${String(row.month).padStart(2, '0')}`,
        Actual: Number(row.net_income ?? row.Actual ?? 0),
        RandomForest: predRow ? Number(predRow.RandomForest ?? 0) : null,
        GradientBoosting: predRow ? Number(predRow.GradientBoosting ?? 0) : null,
        SVR: predRow ? Number(predRow.SVR ?? 0) : null,
      };
    }).sort((a, b) => a.sortKey - b.sortKey); // Ensure chronological order

    return merged.map((d, i) => ({ ...d, index: i }));
  }, [pointsData, predictionData]);

  const displayData = useMemo(() => {
  // IF NO CLICK YET: Show the full historical line with all points visible
  if (splitIndex === null) {
    return allData.map(d => ({
      ...d,
      Actual: d.Actual,
      RandomForest: null, // Hide predictions initially
      GradientBoosting: null,
      SVR: null
    }));
  }

  // AFTER CLICK: Your existing split logic
  return allData.map(d => ({
    ...d,
    // Show Actual only up to the split point (or keep full, depending on preference)
    Actual: d.index <= splitIndex ? d.Actual : null, 
    
    // Show Predictions only from the split point forward
    RandomForest: d.index >= splitIndex && selectedModels.includes('RandomForest') ? d.RandomForest : null,
    GradientBoosting: d.index >= splitIndex && selectedModels.includes('GradientBoosting') ? d.GradientBoosting : null,
    SVR: d.index >= splitIndex && selectedModels.includes('SVR') ? d.SVR : null,
  }));
}, [allData, splitIndex, selectedModels]);

  // 2. HIGH-CONTRAST COLORS: Based on your request for better visibility
  const MODEL_COLORS = {
  RandomForest: '#6c757d',      // Slate Grey
  GradientBoosting: '#343a40',  // Dark Gunmetal
  SVR: '#495057',               // Steel Grey
};

  const CustomDot = (modelName) => (props) => {
    const { cx, cy, index } = props;
    if (splitIndex !== null && index === splitIndex) {
      return <circle cx={cx} cy={cy} r={6} fill={MODEL_COLORS[modelName]} stroke="#fff" strokeWidth={2} />;
    }
    return null;
  };

  const handleChartClick = (data) => {
    if (data && data.activeTooltipIndex !== undefined) {
      setSplitIndex(data.activeTooltipIndex);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ color: '#1A1A2E', margin: 0, fontSize: 15, fontWeight: 700 }}>
          Financial Forecast: Actual vs. Predictions
        </h3>
        {splitIndex !== null && (
          <button onClick={() => setSplitIndex(null)} className="btn-bw-outline">Reset Split</button>
        )}
      </div>

      <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
        Click any point on the black line to start the forecast from that date.
      </p>

      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={displayData} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(val, name) => [val != null ? `$${val.toLocaleString()}` : '—', name]} />
          <Legend iconType="circle" />

          {splitIndex !== null && (
            <ReferenceLine x={allData[splitIndex]?.label} stroke="#000" strokeDasharray="3 3" />
          )}

          {/* 3. ACTUAL LINE: Thick Black Line */}
          {/* Example for RandomForest - apply similar logic to others */}
{/* ACTUAL LINE */}
{/* ACTUAL LINE: The boldest element */}
/* --- Inside InteractivePredictionGraph --- */

{/* Actual Line: Always Pure Black */}
<Line
  type="monotone"
  dataKey="Actual"
  stroke="#000000"
  strokeWidth={4}
  dot={splitIndex === null ? { r: 3, fill: '#000' } : false}
/>

{/* Model Lines: Updated to use the new grey palette */}
<Line
  type="monotone"
  dataKey="RandomForest"
  stroke={MODEL_COLORS.RandomForest} // This now uses #6c757d
  strokeWidth={2.5}
  strokeDasharray="10 5"
  hide={!selectedModels.includes('RandomForest')}
  dot={false}
/>

<Line
  type="monotone"
  dataKey="GradientBoosting"
  stroke={MODEL_COLORS.GradientBoosting} // This now uses #343a40
  strokeWidth={2.5}
  strokeDasharray="3 3"
  hide={!selectedModels.includes('GradientBoosting')}
  dot={false}
/>

<Line
  type="monotone"
  dataKey="SVR"
  stroke={MODEL_COLORS.SVR} // This now uses #495057
  strokeWidth={2.5}
  strokeDasharray="10 5 2 5"
  hide={!selectedModels.includes('SVR')}
  dot={false}
/>

{/* MODEL 3: SVR (#495057) - Dotted line */}
<Line
  type="monotone"
  dataKey="SVR"
  stroke={MODEL_COLORS.SVR}
  strokeWidth={2}
  strokeDasharray="3 3" 
  dot={false}
  hide={!selectedModels.includes('SVR')}
/>
{/* PREDICTION LINES (Same as before) */}
<Line
  type="monotone"
  dataKey="RandomForest"
  stroke={MODEL_COLORS.RandomForest}
  strokeWidth={3}
  strokeDasharray="8 4"
  dot={false}
  connectNulls={false} // Prevents the line from jumping back to 0
/>
          <Line
            type="monotone"
            dataKey="GradientBoosting"
            stroke={MODEL_COLORS.GradientBoosting}
            strokeWidth={2.5}
            strokeDasharray="5 5"
            dot={CustomDot('GradientBoosting')}
            hide={!selectedModels.includes('GradientBoosting')}
          />
          <Line
            type="monotone"
            dataKey="SVR"
            stroke={MODEL_COLORS.SVR}
            strokeWidth={2.5}
            strokeDasharray="5 5"
            dot={CustomDot('SVR')}
            hide={!selectedModels.includes('SVR')}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Model Selector (multi-select dropdown) ──────────────────────────────────
function ModelSelector({ selectedModels, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const ALL_MODELS = ['RandomForest', 'GradientBoosting', 'SVR'];
  // Grayscale Palette for a Professional Look
const MODEL_COLORS = {
  RandomForest: '#6c757d',      // Slate Grey
  GradientBoosting: '#343a40',  // Dark Gunmetal
  SVR: '#495057',               // Steel Grey
};

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [selectedPreviewFile, setSelectedPreviewFile] = useState(null);

  const toggle = (model) => {
    if (selectedModels.includes(model)) {
      if (selectedModels.length === 1) return; // keep at least 1
      onChange(selectedModels.filter(m => m !== model));
    } else {
      onChange([...selectedModels, model]);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', minWidth: 240 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '9px 14px', background: '#1a1a2e',
          border: '1px solid #2d2d4e', borderRadius: 8, color: '#e0e0e0',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: 13
        }}
      >
        <span>
          {selectedModels.length === ALL_MODELS.length
            ? 'All Models Selected'
            : `${selectedModels.length} Model${selectedModels.length > 1 ? 's' : ''} Selected`}
        </span>
        <span style={{ marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 999, width: '100%',
          background: '#12122a', border: '1px solid #2d2d4e', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden'
        }}>
          {ALL_MODELS.map(model => (
            <div
              key={model}
              onClick={() => toggle(model)}
              style={{
                padding: '10px 16px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 10,
                background: selectedModels.includes(model) ? '#1a1a3e' : 'transparent',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1f1f40'}
              onMouseLeave={e => e.currentTarget.style.background = selectedModels.includes(model) ? '#1a1a3e' : 'transparent'}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4,
                border: `2px solid ${MODEL_COLORS[model]}`,
                background: selectedModels.includes(model) ? MODEL_COLORS[model] : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {selectedModels.includes(model) && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ color: MODEL_COLORS[model], fontWeight: 600, fontSize: 13 }}>{model}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataTable({ rows }) {
  if (!rows || rows.length === 0) return <p className="muted">No rows to display.</p>;
  const columns = Object.keys(rows[0]);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(col => <th key={col}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{columns.map(col => <td key={col}>{String(row[col] ?? '')}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SimpleBarChart({ data }) {
  if (!data || data.length === 0) return null;
  const maxCount = Math.max(...data.map(d => Number(d.count || 0)), 1);
  return (
    <div className="bar-grid">
      {data.map(item => {
        const count = Number(item.count || 0);
        const widthPercent = (count / maxCount) * 100;
        return (
          <div key={item.anomaly_pred} className="bar-row">
            <span className="bar-label">{item.anomaly_pred}</span>
            <div className="bar-shell"><div className="bar-fill" style={{ width: `${widthPercent}%` }} /></div>
            <span className="bar-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function anomalyCountsToRows(countsDict) {
  if (!countsDict || typeof countsDict !== 'object') return [];
  return Object.entries(countsDict).map(([anomaly_pred, count]) => ({ anomaly_pred, count }));
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState('prediction');
  const [selectedLocalFiles, setSelectedLocalFiles] = useState([]);
  const [contamination, setContamination] = useState(0.05);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState(null);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [dbSummary, setDbSummary] = useState(null);

  const [selectedTrainFile, setSelectedTrainFile] = useState('');
  const [selectedAnomalyFile, setSelectedAnomalyFile] = useState('');
  const [selectedPredictionFile, setSelectedPredictionFile] = useState('');

  // Model multi-select
  const [selectedModels, setSelectedModels] = useState(['RandomForest', 'GradientBoosting', 'SVR']);

  const [loadingFiles, setLoadingFiles] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [predictLoading, setPredictLoading] = useState(false);
  const [error, setError] = useState('');

  const [anomalyResult, setAnomalyResult] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);

  const dataFiles = useMemo(() => (files || []).filter(f => f.file_type === 'csv'), [files]);

  const loadFiles = async () => {
    setLoadingFiles(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/files`);
      if (!res.ok) throw new Error('Failed to load files.');
      const payload = await res.json();
      setFiles(Array.isArray(payload?.files) ? payload.files : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => { loadFiles(); }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/database/summary`);
        if (!res.ok) return;
        setDbSummary(await res.json());
      } catch {}
    };
    load();
  }, []);

  const runPipeline = async () => {
    if (!selectedTrainFile || !selectedAnomalyFile) {
      setError('Please select both a training dataset and an anomaly dataset.'); return;
    }
    setPipelineLoading(true); setError(''); setAnomalyResult(null);
    try {
      const trainUrl = `${API_BASE}/api/run-pipeline?train_file=${encodeURIComponent(selectedTrainFile)}&anomaly_file=${encodeURIComponent(selectedAnomalyFile)}`;
      const trainRes = await fetch(trainUrl, { method: 'POST', headers: { accept: 'application/json' } });
      const trainPayload = await trainRes.json();
      if (!trainRes.ok) throw new Error(trainPayload.detail || 'Pipeline failed.');

      const anomalyUrl = `${API_BASE}/api/detect-anomalies?anomaly_file=${encodeURIComponent(selectedAnomalyFile)}`;
      const anomalyRes = await fetch(anomalyUrl, { method: 'POST', headers: { accept: 'application/json' } });
      const anomalyPayload = await anomalyRes.json();
      if (!anomalyRes.ok) throw new Error(anomalyPayload.detail || 'Anomaly detection failed.');

      setAnomalyResult({
        trainStatus: trainPayload.status,
        bestModel: trainPayload.best_model,
        anomalyCounts: anomalyCountsToRows(anomalyPayload.anomaly_counts),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setPipelineLoading(false);
    }
  };

  const runPrediction = async () => {
    if (!selectedPredictionFile) { setError('Please select a dataset for prediction.'); return; }
    if (selectedModels.length === 0) { setError('Please select at least one model.'); return; }
    setPredictLoading(true); setError(''); setPredictionResult(null);
    try {
      const url = `${API_BASE}/api/predict?train_file=${encodeURIComponent(selectedPredictionFile)}&models=${encodeURIComponent(selectedModels.join(','))}`;
      const res = await fetch(url, { method: 'POST', headers: { accept: 'application/json' } });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || 'Prediction failed.');
      setPredictionResult(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setPredictLoading(false);
    }
  };

  const runCorrection = async () => {
    if (!selectedAnomalyFile) return setError('Select a file first.');
    setCorrectionLoading(true);
    try {
      const url = `${API_BASE}/api/fix-anomalies?file_name=${encodeURIComponent(selectedAnomalyFile)}&contamination=${contamination}`;
      const res = await fetch(url, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail);
      setUploadMessage(`Corrected ${payload.anomalies_fixed} points. Saved as ${payload.fixed_file}`);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    } finally {
      setCorrectionLoading(false);
    }
  };

  const handleUpload = async (event) => {
    const uploadedFiles = Array.from(event.target.files || []);
    if (!uploadedFiles.length) return;
    setSelectedLocalFiles(uploadedFiles.map(f => f.name));
    setUploading(true); setError(''); setUploadMessage('');
    try {
      const formData = new FormData();
      uploadedFiles.forEach(file => formData.append('files', file));
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || 'Upload failed.');
      setUploadMessage(`Uploaded ${payload.saved?.length || 0} file(s).`);
      await loadFiles();
      setSelectedLocalFiles([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const deleteFile = async (fileName) => {
    if (!window.confirm(`Delete ${fileName}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete file');
      await loadFiles();
      setUploadMessage(`Deleted ${fileName}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const tabDataFiles = dataFiles.map(f => f.file_name);

  return (
    <div className="layout">
      {/* ── Sidebar ── */}
      {/* Sidebar */}
{/* Sidebar */}
<aside className="sidebar">
  <h2>Workspace Files</h2>
  <div className="file-list">
    {tabDataFiles?.map((name) => (
      <div
        key={name}
        className={`file-item ${selectedPreviewFile === name ? 'active' : ''}`}
        onClick={() => setSelectedPreviewFile(name)} // This updates the state
      >
        <span className="file-icon"></span>
        {name}
      </div>
    ))}
  </div>

  {/* Only show preview if selectedPreviewFile is defined and not null */}
  {selectedPreviewFile && (
    <div className="sidebar-preview-container">
      <h3>Quick Preview</h3>
      {/* Safety check: ensuring FilePreviewer exists */}
      <FilePreviewer fileName={selectedPreviewFile} />
    </div>
  )}

  <label className="upload-button">
    Upload CSV
    <input type="file" accept=".csv" onChange={handleUpload} hidden />
  </label>
</aside>
      {/* ── Main Panel ── */}
      <main className="main-panel">
        <header>
          <h1>Prediction Model and Anomaly Detection</h1>
          <p>Upload datasets, choose a tab, select a dataset, and run the related task.</p>
        </header>

        {error && <div className="alert error">{error}</div>}

        {dbSummary && (
          <section className="panel db-panel">
            <h3>Database Storage</h3>
            <div className="metric-grid">
              <Metric label="Stored Files" value={dbSummary.total_files ?? 0} />
              <Metric label="Total Size" value={dbSummary.total_size_bytes ? `${(dbSummary.total_size_bytes / 1024).toFixed(1)} KB` : '0 KB'} />
              <Metric label="File Types" value={(dbSummary.file_types || []).map(ft => ft.file_type).join(', ') || 'N/A'} />
            </div>
          </section>
        )}

        <section className="panel">
          {/* ── Tab Buttons — Analysis tab removed ── */}
          <div className="tab-row">
            <button className={`tab-btn ${activeTab === 'prediction' ? 'active' : ''}`} onClick={() => setActiveTab('prediction')}>
              Prediction
            </button>
            <button className={`tab-btn ${activeTab === 'anomaly' ? 'active' : ''}`} onClick={() => setActiveTab('anomaly')}>
              Anomaly Detection
            </button>
          </div>

          {/* ── ANOMALY TAB ── */}
          {/* ── ANOMALY TAB ── */}
{activeTab === 'anomaly' && (
  <div className="tab-panel">
    <h3>Anomaly Detection & Correction</h3>
    <div className="form-grid one-column">
      
      {/* 1. TRAINING DATASET SELECTOR (Missing or Unfilled) */}
      <label>
        Base Training Dataset (Normal Patterns)
        <select value={selectedTrainFile} onChange={e => setSelectedTrainFile(e.target.value)}>
          <option value="">-- Select Training File --</option>
          {tabDataFiles.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>

      {/* 2. ANOMALY DATASET SELECTOR */}
      <label>
        Dataset to Check for Anomalies
        <select value={selectedAnomalyFile} onChange={e => setSelectedAnomalyFile(e.target.value)}>
          <option value="">-- Select Anomaly File --</option>
          {tabDataFiles.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>

      {/* Preview of the file to be checked */}
      {selectedAnomalyFile && <FilePreviewer fileName={selectedAnomalyFile} />}

      <label>
        Sensitivity (Contamination: {(contamination * 100).toFixed(0)}%)
        <input type="range" min="0.01" max="0.20" step="0.01" value={contamination} onChange={e => setContamination(Number(e.target.value))} />
      </label>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={runPipeline} disabled={pipelineLoading}>
          {pipelineLoading ? 'Detecting...' : 'Detect Anomalies'}
        </button>
      </div>
    </div>
  </div>
)}

          {/* ── PREDICTION TAB ── */}
          {activeTab === 'prediction' && (
            <div className="tab-panel">
              <h3>Predict Net Income</h3>
              <div className="form-grid one-column">

                {/* Dataset selector */}
                <label>
                  Dataset for Prediction
                  <select value={selectedPredictionFile} onChange={e => { setSelectedPredictionFile(e.target.value); setPredictionResult(null); }}>
                    <option value="">-- Select a File --</option>
                    {tabDataFiles.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>

                {/* File Previewer */}
                <FilePreviewer fileName={selectedPredictionFile} />

                {/* Model Evaluation Table placeholder — shown after prediction */}
                {predictionResult?.model_metrics && (
                  <ModelEvaluationTable metrics={predictionResult.model_metrics} />
                )}

                {/* ── Model Multi-Select Dropdown ── */}
                {/* Model Selection Group - Updated with Black & White Style */}
<div style={{ marginBottom: 16 }}>
  <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Select Prediction Models:</p>
  {/* Look around line 726 in App.jsx */}
<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
  {['RandomForest', 'GradientBoosting', 'SVR'].map((m) => (
    <button
      key={m}
      onClick={() => {
        if (selectedModels.includes(m)) {
          setSelectedModels(selectedModels.filter(item => item !== m));
        } else {
          setSelectedModels([...selectedModels, m]);
        }
      }}
      style={{
  backgroundColor: selectedModels.includes(m) ? MODEL_COLORS[m] : '#fff',
  // This ensures the text is white on dark grey backgrounds
  color: selectedModels.includes(m) ? '#fff' : '#000', 
  border: `2px solid ${MODEL_COLORS[m]}`,
  borderRadius: '6px',
  padding: '8px 16px',
  fontWeight: 'bold',
  cursor: 'pointer'
}}
    >
      {m}
    </button>
  ))}
</div>
</div>

                <button
                  onClick={runPrediction}
                  disabled={predictLoading || !selectedPredictionFile || selectedModels.length === 0}
                  style={{ marginTop: 4 }}
                >
                  {predictLoading ? 'Running Prediction...' : 'Run Prediction'}
                </button>
              </div>

              {/* ── Interactive Prediction Graph ── */}
              {predictionResult && (
                <section className="panel" style={{ marginTop: 16 }}>
                  <InteractivePredictionGraph
                    pointsData={predictionResult.points_data}
                    predictionData={predictionResult.prediction_data}
                    selectedModels={selectedModels}
                  />

                  {/* Best model badge */}
                  {predictionResult.best_model && (
                    <div className="metric-grid" style={{ marginTop: 16 }}>
                      <Metric label="Best Model" value={predictionResult.best_model} />
                      {predictionResult.accuracy && <Metric label="Accuracy" value={predictionResult.accuracy} />}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;