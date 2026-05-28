import React, { useEffect, useMemo, useState } from "react";
import { api } from "../hooks/api";
import API_BASE from "../config";

export default function DashboardPage({ navigate }) {
  const [projects, setProjects] = useState([]);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const projectList = await api.listProjects();
        const enrichedProjects = await Promise.all(
          (projectList || []).map(async (project) => {
            try {
              const datasets = await api.listDatasets(project.id);
              return {
                ...project,
                datasets: datasets || [],
              };
            } catch (err) {
              return { ...project, datasets: [] };
            }
          })
        );

        if (!active) return;
        setProjects(enrichedProjects);
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load the dashboard right now.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const handleSeedDemo = async () => {
    if (!window.confirm('This will create 3 demo projects (CPG, SaaS, Retail) with pre-generated datasets. Continue?')) return;
    setSeeding(true);
    setSeedMessage('');
    try {
      const res = await fetch(API_BASE + '/seed-demo', { method: 'POST' });
      const data = await res.json();
      setSeedMessage(data.message || 'Demo data seeded!');
      const projectList = await api.listProjects();
      const enriched = await Promise.all(
        (projectList || []).map(async (project) => {
          try {
            const datasets = await api.listDatasets(project.id);
            return { ...project, datasets: datasets || [] };
          } catch { return { ...project, datasets: [] }; }
        })
      );
      setProjects(enriched);
    } catch (err) {
      setSeedMessage('Error seeding demo data: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const summary = useMemo(() => {
    const totalDatasets = projects.reduce((sum, project) => sum + (project.datasets?.length || 0), 0);
    const totalRows = projects.reduce(
      (sum, project) => sum + (project.datasets || []).reduce((inner, dataset) => inner + (dataset.total_row_count || 0), 0),
      0
    );

    return {
      totalProjects: projects.length,
      totalDatasets,
      totalRows,
    };
  }, [projects]);

  const recentProjects = [...projects].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);

  return (
    <div style={{ padding: "24px 24px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div>
          <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>Workspace overview</p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, fontWeight: 800, color: "#111827" }}>FP&A Dashboard</h1>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn-outline" onClick={() => navigate("projects")}>Open Projects</button>
          <button className="btn-primary" onClick={() => navigate("new-project")}>Create Project</button>
        </div>
      </div>

      {error ? (
        <div style={{ padding: 20, borderRadius: 16, background: "#fff1f2", color: "#9f1239", border: "1px solid #fecdd3" }}>
          {error}
        </div>
      ) : null}
      {seedMessage ? (
        <div style={{ padding: 16, borderRadius: 16, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", marginBottom: 16 }}>
          ✓ {seedMessage}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: "#64748b", padding: 24 }}>Loading dashboard data...</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 20, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)" }}>
              <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Projects</div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 12 }}>{summary.totalProjects}</div>
              <div style={{ color: "#475569", marginTop: 8 }}>Active FP&A workspaces in this environment.</div>
            </div>
            <div style={{ padding: 20, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)" }}>
              <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Datasets</div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 12 }}>{summary.totalDatasets}</div>
              <div style={{ color: "#475569", marginTop: 8 }}>Generated datasets currently stored for analysis.</div>
            </div>
            <div style={{ padding: 20, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)" }}>
              <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Rows</div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 12 }}>{summary.totalRows.toLocaleString()}</div>
              <div style={{ color: "#475569", marginTop: 8 }}>Combined fact table size across your generated outputs.</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
            <section style={{ padding: 20, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, color: "#111827" }}>Recent Projects</h2>
                  <p style={{ margin: "6px 0 0", color: "#64748b" }}>Latest workspaces and their dataset coverage.</p>
                </div>
                <button className="btn-outline" onClick={() => navigate("projects")}>View all</button>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {recentProjects.length === 0 ? (
                  <div style={{ padding: 20, borderRadius: 16, background: "#f8fafc", color: "#475569" }}>
                    No projects yet. Click <strong style={{cursor:'pointer',color:'#e11d48'}} onClick={handleSeedDemo}>Load Demo Projects</strong> to instantly populate 3 sample workspaces, or create your own.
                  </div>
                ) : (
                  recentProjects.map((project) => (
                    <div key={project.id} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#111827" }}>{project.name}</div>
                        <div style={{ color: "#64748b", fontSize: 14, marginTop: 6 }}>
                          {project.industry?.name || "Custom industry"} • created {new Date(project.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{project.datasets?.length || 0}</div>
                        <div style={{ color: "#64748b", fontSize: 13 }}>datasets</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section style={{ padding: 20, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)" }}>
              <h2 style={{ marginTop: 0, fontSize: 20, color: "#111827" }}>Quick actions</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <button className="btn-primary" onClick={() => navigate("new-project")}>Start a new project</button>
                <button className="btn-outline" onClick={() => navigate("templates")}>Manage templates</button>
                <button
                  className="btn-outline"
                  style={{ borderColor: '#e11d48', color: '#e11d48' }}
                  disabled={seeding}
                  onClick={handleSeedDemo}
                >
                  {seeding ? 'Generating demo data...' : '🚀 Load Demo Projects'}
                </button>
                <button
                  className="btn-outline"
                  disabled={loading}
                  onClick={() => {
                    const targetProject = recentProjects[0];
                    if (targetProject?.id) {
                      navigate("analytics", { projectId: targetProject.id });
                      return;
                    }
                    navigate("analytics");
                  }}
                >
                  {loading ? "Loading analytics..." : "Explore analytics"}
                </button>
              </div>

              <div style={{ marginTop: 20, padding: 16, borderRadius: 16, background: "#f8fafc", color: "#334155" }}>
                <div style={{ fontWeight: 700 }}>How to use</div>
                <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
                  <li>Create or open a project to generate a synthetic dataset.</li>
                  <li>Use the analytics page to inspect monthly trends and custom chart views.</li>
                  <li>Download slices or full exports from the dataset workspace.</li>
                </ul>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
