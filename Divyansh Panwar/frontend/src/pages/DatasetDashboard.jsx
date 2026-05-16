import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './DatasetDashboard.css';

const COLORS = ['#e11d48', '#2dd4bf', '#fbbf24', '#818cf8', '#f472b6', '#a855f7', '#10b981'];

const AVAILABLE_DIMENSIONS = ['month', 'region', 'product', 'channel', 'year'];
const AVAILABLE_METRICS = ['revenue', 'cogs', 'ebitda', 'units', 'marketing_expense', 'other_opex', 'net_income'];

export default function DatasetDashboard({ projectId, datasetId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- Dynamic Chart State ---
  const [customData, setCustomData] = useState([]);
  const [selectedDim, setSelectedDim] = useState('region');
  const [selectedMetrics, setSelectedMetrics] = useState(['revenue', 'ebitda']);
  const [chartType, setChartType] = useState('Bar');

  useEffect(() => {
    // Load standard dashboard stats
    fetch(`http://localhost:8000/api/projects/${projectId}/datasets/${datasetId}/dashboard-stats`)
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => console.error("Failed to load stats", err));
  }, [projectId, datasetId]);

  // Fetch custom chart data whenever the user changes the dropdowns!
  useEffect(() => {
    if (!datasetId || selectedMetrics.length === 0) return;

    fetch(`http://localhost:8000/api/projects/${projectId}/datasets/${datasetId}/custom-chart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dimension: selectedDim, metrics: selectedMetrics })
    })
      .then(res => res.json())
      .then(data => setCustomData(data.data || []))
      .catch(err => console.error("Failed to fetch custom chart data", err));
  }, [projectId, datasetId, selectedDim, selectedMetrics]);

  if (loading) return <div className="dashboard-loading">Analyzing million-row dataset...</div>;
  if (!stats || stats.error) return null;

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: "compact" }).format(val);

  const toggleMetric = (metric) => {
    if (selectedMetrics.includes(metric)) {
      setSelectedMetrics(selectedMetrics.filter(m => m !== metric));
    } else {
      setSelectedMetrics([...selectedMetrics, metric]);
    }
  };

  // Helper to render the dynamic chart based on dropdown selection
  const renderDynamicChart = () => {
    if (customData.length === 0) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No data available for these fields.</div>;

    const commonProps = {
      data: customData, margin: { top: 10, right: 10, left: 0, bottom: 0 }
    };

    const axesAndExtras = (
      <>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey={selectedDim} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={(value) => formatCurrency(value)} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
      </>
    );

    if (chartType === 'Bar') {
      return (
        <BarChart {...commonProps}>
          {axesAndExtras}
          {selectedMetrics.map((m, i) => <Bar key={m} dataKey={m} name={m.toUpperCase()} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
        </BarChart>
      );
    } else if (chartType === 'Area') {
      return (
        <AreaChart {...commonProps}>
          {axesAndExtras}
          {selectedMetrics.map((m, i) => <Area key={m} type="monotone" dataKey={m} name={m.toUpperCase()} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />)}
        </AreaChart>
      );
    } else {
      return (
        <LineChart {...commonProps}>
          {axesAndExtras}
          {selectedMetrics.map((m, i) => <Line key={m} type="monotone" dataKey={m} name={m.toUpperCase()} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={false} />)}
        </LineChart>
      );
    }
  };

  return (
    <div className="dashboard-wrapper">
      
      {/* --- STANDARD KPIs --- */}
      <h3 className="dashboard-title">Dataset Analytics</h3>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">TOTAL REVENUE</div>
          <div className="kpi-value">{formatCurrency(stats.kpis.total_revenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">TOTAL UNITS SOLD</div>
          <div className="kpi-value">{stats.kpis.total_units.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">AVG GROSS MARGIN</div>
          <div className="kpi-value success">{stats.kpis.avg_margin_pct.toFixed(1)}%</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h4 className="chart-title">Financial Performance (Monthly)</h4>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#0f172a" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="cogs" name="COGS" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h4 className="chart-title">Revenue by Product</h4>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.product_mix} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {stats.product_mix.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* --- NEW: CUSTOM EXPLORER --- */}
      <div className="custom-explorer-section">
        <h3 className="dashboard-title" style={{ marginTop: '40px' }}>Custom Chart Builder</h3>
        
        <div className="explorer-controls">
          <div className="control-group">
            <label>X-Axis (Dimension)</label>
            <select value={selectedDim} onChange={(e) => setSelectedDim(e.target.value)}>
              {AVAILABLE_DIMENSIONS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
            </select>
          </div>
          
          <div className="control-group">
            <label>Chart Type</label>
            <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
              <option value="Bar">Bar Chart</option>
              <option value="Line">Line Chart</option>
              <option value="Area">Area Chart</option>
            </select>
          </div>

          <div className="control-group full-width">
            <label>Y-Axis (Metrics to Plot)</label>
            <div className="metrics-checkboxes">
              {AVAILABLE_METRICS.map(m => (
                <label key={m} className={`metric-chip ${selectedMetrics.includes(m) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedMetrics.includes(m)} onChange={() => toggleMetric(m)} style={{ display: 'none' }} />
                  {m.replace('_', ' ').toUpperCase()}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="chart-card" style={{ marginTop: '20px' }}>
          <h4 className="chart-title">{selectedMetrics.join(' & ').toUpperCase()} by {selectedDim.toUpperCase()}</h4>
          <div className="chart-container" style={{ height: '400px' }}>
            <ResponsiveContainer width="100%" height="100%">
              {renderDynamicChart()}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}