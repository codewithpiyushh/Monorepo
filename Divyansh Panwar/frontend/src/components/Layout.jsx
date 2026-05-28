import React from 'react';

export default function Layout({ children, navigate, currentRoute }) {
  const isProjectsActive = ['projects', 'project-detail', 'new-project', 'new-dataset'].includes(currentRoute);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">FP&A Studio</h1>
          <span className="sidebar-subtitle">v1.0 • Enterprise</span>
        </div>

        <div className="sidebar-menu">
          <div className="menu-category">Workspace</div>

          <div
            className={`menu-item ${isProjectsActive ? 'active' : ''}`}
            onClick={() => navigate("projects")}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>⬡</span> Projects
            </div>

          </div>

          <div
            className={`menu-item ${currentRoute === 'dashboard' ? 'active' : ''}`}
            onClick={() => navigate("dashboard")}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>◇</span> Dashboard
            </div>
          </div>

          <div
            className={`menu-item ${currentRoute === 'analytics' ? 'active' : ''}`}
            onClick={() => navigate("analytics")}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>◎</span> Analytics
            </div>
            <span className="menu-badge dark">3</span>
          </div>

          <div className="menu-category">Tools</div>

          <div
            className={`menu-item ${currentRoute === 'templates' ? 'active' : ''}`}
            onClick={() => navigate("templates")}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>⊞</span> Templates
            </div>
          </div>

          <div className={`menu-item ${currentRoute === 'settings' ? 'active' : ''}`} onClick={() => navigate("settings")}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>⚙</span> Settings
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}