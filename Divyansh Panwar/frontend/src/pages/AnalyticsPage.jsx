import React, { useEffect, useMemo, useState } from "react";
import DatasetDashboard from "./DatasetDashboard";
import { api } from "../hooks/api";

export default function AnalyticsPage({ navigate, params }) {
  const { projectId, datasetId: initialDatasetId } = params || {};
  const [project, setProject] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(initialDatasetId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      try {
        if (!projectId) {
          setDatasets([]);
          setProject(null);
          setSelectedDatasetId("");
          setLoading(false);
          return;
        }

        setLoading(true);
        setError("");

        const [projectData, datasetData] = await Promise.all([
          api.getProject(projectId),
          api.listDatasets(projectId),
        ]);

        if (!active) return;

        setProject(projectData);
        setDatasets(datasetData || []);
        setSelectedDatasetId((current) => {
          if (current) {
            return current;
          }
          return (datasetData || []).length > 0 ? String(datasetData[0].id) : "";
        });
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load analytics for this project.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAnalytics();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!datasets.length) {
      if (selectedDatasetId !== "") {
        setSelectedDatasetId("");
      }
      return;
    }

    if (!datasets.some((dataset) => String(dataset.id) === String(selectedDatasetId))) {
      setSelectedDatasetId(String(datasets[0].id));
    }
  }, [datasets, selectedDatasetId]);

  const selectedDataset = useMemo(() => datasets.find((dataset) => String(dataset.id) === String(selectedDatasetId)), [datasets, selectedDatasetId]);

  return (
    <div style={{ padding: "24px 24px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div>
          <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>Dataset explorer</p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, fontWeight: 800, color: "#111827" }}>Analytics</h1>
          <p style={{ margin: "8px 0 0", color: "#475569" }}>
            {project ? `Viewing analytics for ${project.name}` : "Select a project and dataset to inspect."}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn-outline" onClick={() => navigate(projectId ? "project-detail" : "projects", projectId ? { projectId } : {})}>← Back</button>
          <button className="btn-primary" onClick={() => navigate("dashboard")}>Go to dashboard</button>
        </div>
      </div>

      {error ? (
        <div style={{ padding: 20, borderRadius: 16, background: "#fff1f2", color: "#9f1239", border: "1px solid #fecdd3", marginBottom: 24 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: "#64748b", padding: 24 }}>Loading analytics...</div>
      ) : (
        <>
          {!projectId ? (
            <div style={{ padding: 24, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0" }}>
              Choose a project from the Projects page to view its analytics.
            </div>
          ) : datasets.length === 0 ? (
            <div style={{ padding: 24, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0" }}>
              This project does not have any generated datasets yet. Create or generate a dataset to inspect the analytics panel.
            </div>
          ) : (
            <>
              <div style={{ padding: 20, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", marginBottom: 24 }}>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Select dataset</label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  style={{ borderRadius: 12, border: "1px solid #cbd5e1", padding: "10px 12px", minWidth: 280 }}
                >
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      Dataset #{dataset.id} • {dataset.total_row_count?.toLocaleString() || 0} rows • {dataset.status}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 12, color: "#64748b" }}>
                  {selectedDataset ? `Showing analytics for ${selectedDataset.id}` : "Select a dataset to render the charts."}
                </div>
              </div>

              {selectedDatasetId ? (
                <div style={{ borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", padding: 16 }}>
                  <DatasetDashboard projectId={projectId} datasetId={selectedDatasetId} />
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
