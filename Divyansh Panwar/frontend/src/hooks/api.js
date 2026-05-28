/**
 * api.js – Centralised API client for the FP&A Synthetic Data Generator
 * All pages import { api } from "../hooks/api"
 */

import API_BASE from "../config";

async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail || err.message || detail;
    } catch (_) {}
    throw new Error(detail);
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

export const api = {
  // ── Templates ─────────────────────────────────────────────
  /** GET /api/templates → list of industry template objects */
  getTemplates: () => request("GET", "/templates"),

  /** GET /api/templates/:industry → single template JSON */
  getTemplate: (industry) => request("GET", `/templates/${industry}`),

  /** POST /api/templates */
  createTemplate: (body) => request("POST", "/templates", body),

  /** PUT /api/templates/:industry */
  updateTemplate: (industry, body) => request("PUT", `/templates/${industry}`, body),

  /** DELETE /api/templates/:industry */
  deleteTemplate: (industry) => request("DELETE", `/templates/${industry}`),

  // ── Projects ──────────────────────────────────────────────
  /** GET /api/projects → ProjectResponse[] */
  listProjects: () => request("GET", "/projects"),

  /** GET /api/projects/:id → ProjectResponse */
  getProject: (id) => request("GET", `/projects/${id}`),

  /**
   * POST /api/projects
   * body: { name, industry, description?, template_overrides? }
   * → ProjectResponse
   */
  createProject: (body) => request("POST", "/projects", body),

  /** DELETE /api/projects/:id */
  deleteProject: (id) => request("DELETE", `/projects/${id}`),

  // ── Datasets ──────────────────────────────────────────────
  /** GET /api/projects/:projectId/datasets */
  listDatasets: (projectId) => request("GET", `/projects/${projectId}/datasets`),

  /**
   * POST /api/projects/:projectId/datasets
   * body: DatasetRequest
   */
  createDataset: (projectId, body) =>
    request("POST", `/projects/${projectId}/datasets`, body),

  /** DELETE /api/projects/:projectId/datasets/:datasetId */
  deleteDataset: (projectId, datasetId) =>
    request("DELETE", `/projects/${projectId}/datasets/${datasetId}`),

  // ── Analytics / Dashboard ─────────────────────────────────
  /** GET /api/projects/:projectId/datasets/:datasetId/dashboard-stats */
  getDashboardStats: (projectId, datasetId) =>
    request("GET", `/projects/${projectId}/datasets/${datasetId}/dashboard-stats`),

  /** POST /api/projects/:projectId/datasets/:datasetId/custom-chart */
  getCustomChartData: (projectId, datasetId, body) =>
    request(
      "POST",
      `/projects/${projectId}/datasets/${datasetId}/custom-chart`,
      body
    ),

  // ── Custom Logic ──────────────────────────────────────────
  /** GET /api/projects/:projectId/custom-logic */
  getCustomLogic: (projectId) =>
    request("GET", `/projects/${projectId}/custom-logic`),

  /** POST /api/projects/:projectId/custom-logic */
  saveCustomLogic: (projectId, code) =>
    request("POST", `/projects/${projectId}/custom-logic`, { code }),

  // ── Files / Advanced Slice ─────────────────────────────────
  /**
   * GET /api/projects/:projectId/datasets/:datasetId/files/:fileName/advanced-schema
   * → { schema: [{ column, members }] }
   */
  getAdvancedSchema: (projectId, datasetId, fileName) =>
    request(
      "GET",
      `/projects/${projectId}/datasets/${datasetId}/files/${fileName}/advanced-schema`
    ),

  /**
   * POST .../advanced-save
   * body: { selected_columns, filters, custom_file_name }
   */
  advancedSave: (projectId, datasetId, fileName, body) =>
    request(
      "POST",
      `/projects/${projectId}/datasets/${datasetId}/files/${fileName}/advanced-save`,
      body
    ),

  /** Direct download URL (no fetch needed – just set window.location.href) */
  downloadUrl: (projectId, datasetId, fileName) =>
    `${API_BASE}/projects/${projectId}/datasets/${datasetId}/download?file=${fileName}`,

  /** Bulk download all files as ZIP */
  downloadAllUrl: (projectId, datasetId) =>
    `${API_BASE}/projects/${projectId}/datasets/${datasetId}/download-all`,
};

export default API_BASE;
