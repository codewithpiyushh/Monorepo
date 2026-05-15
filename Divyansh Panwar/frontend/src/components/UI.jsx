import { useState } from "react";
import "./UI.css";

export function Card({ children, style = {} }) {
  return <div className="ui-card" style={style}>{children}</div>;
}

export function ToggleSection({ step, title, isActive, isCompleted, onEdit, onNext, summary, children }) {
  const isLocked = !isActive && !isCompleted;
  let statusClass = isActive ? "active" : isCompleted ? "completed" : "";
  if (isLocked) statusClass += " locked";

  return (
    // FIX: Removed the stray 'style={style}' from the Card component!
    <Card>
      <div className={`toggle-section ${statusClass}`}>
        <div className={`ts-header ${isActive ? 'active' : ''}`}>
          <div className="ts-title-wrapper">
            <div className={`ts-circle ${statusClass}`}>
              {isCompleted && !isActive ? "✓" : step}
            </div>
            <div className={`ts-title ${statusClass}`}>{title}</div>
          </div>
          {isCompleted && !isActive && <Btn variant="ghost" size="sm" onClick={onEdit}>Edit</Btn>}
        </div>

        {isActive && (
          <div className="ts-content">
            {children}
            <div className="ts-footer">
              <Btn onClick={onNext}>Continue →</Btn>
            </div>
          </div>
        )}
        {isCompleted && !isActive && <div className="ts-summary">{summary}</div>}
      </div>
    </Card>
  );
}

export function Badge({ children, color = "#e11d48" }) {
  // Inline styles kept here specifically because 'color' is a dynamic prop
  return (
    <span className="ui-badge" style={{ background: color + "1a", color: color, border: `1px solid ${color}33` }}>
      {children.toUpperCase()}
    </span>
  );
}

export function Btn({ children, onClick, variant = "primary", size = "md", disabled = false, style = {} }) {
  return (
    <button 
      onClick={disabled ? undefined : onClick} disabled={disabled}
      className={`ui-btn btn-${size} btn-${variant}`} style={style}
    >
      {children}
    </button>
  );
}

export function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="form-control" />
    </label>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="form-control">
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </label>
  );
}

export function MultiSelect({ label, options, selected, onChange }) {
  const toggle = (val) => selected.includes(val) ? onChange(selected.filter(v => v !== val)) : onChange([...selected, val]);
  return (
    <div className="form-group">
      <span className="form-label">{label}</span>
      <div className="ms-container">
        {options.map(o => {
          const val = o.value ?? o;
          const active = selected.includes(val);
          return (
            <button key={val} onClick={() => toggle(val)} className={`ms-tag ${active ? 'active' : ''}`}>
              {o.label ?? o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format }) {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <div className="form-group">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="form-label">{label}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#e11d48", fontFamily: "'DM Mono', monospace" }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: "100%", margin: "8px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#a8a29e", fontWeight: 500 }}>
        <span>{format ? format(min) : min}</span><span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

export function SectionHeader({ title, subtitle }) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="section-subtitle">{subtitle}</p>}
    </div>
  );
}

export function Spinner() {
  return <span className="ui-spinner"></span>;
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-msg" style={{ marginBottom: action ? 24 : 0 }}>{message}</p>
      {action}
    </div>
  );
}

export function Toast({ message, type = "info" }) {
  return (
    <div className={`ui-toast toast-${type}`}>
      {message}
    </div>
  );
}

export function EditableMultiSelect({ label, options, selected, onOptionChange, onSelectionChange, placeholder = "Type & press Enter..." }) {
  const [isEditing, setIsEditing] = useState(false);
  const [input, setInput] = useState("");

  const toggleSelection = (val) => {
    if (selected.includes(val)) onSelectionChange(selected.filter(v => v !== val));
    else onSelectionChange([...selected, val]);
  };

  const addOption = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      const newVal = input.trim();
      if (!options.includes(newVal)) {
        onOptionChange([...options, newVal]);
        onSelectionChange([...selected, newVal]);
      } else if (!selected.includes(newVal)) {
        onSelectionChange([...selected, newVal]);
      }
      setInput("");
    }
  };

  const removeOption = (val) => {
    onOptionChange(options.filter(x => x !== val));
    onSelectionChange(selected.filter(x => x !== val));
  };

  return (
    <div className="form-group" style={{ gap: 8 }}>
      <div className="ems-header">
        <div className="ems-title-wrap">
          <span className="form-label">{label}</span>
          <button onClick={() => setIsEditing(!isEditing)} className={`ems-edit-btn ${isEditing ? 'editing' : 'static'}`}>
            {isEditing ? "✓ Done Editing" : "✎ Edit Options"}
          </button>
        </div>
        <span className="ems-count">{selected.length} / {options.length} selected</span>
      </div>

      <div className={`ems-box ${isEditing ? 'editing' : 'static'}`}>
        {options.map(o => {
          const isActive = selected.includes(o);
          if (isEditing) {
            return (
              <div key={o} className="ems-tag-edit">
                {o}
                <button onClick={() => removeOption(o)} className="ems-tag-remove">×</button>
              </div>
            );
          }
          return (
            <button key={o} onClick={() => toggleSelection(o)} className={`ems-tag ${isActive ? 'active' : 'inactive'}`}>
              {o}
            </button>
          );
        })}

        {isEditing && (
          <input
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={addOption}
            placeholder={options.length === 0 ? placeholder : "Add more..."}
            className="ems-input"
          />
        )}
        
        {!isEditing && options.length === 0 && (
          <span style={{ fontSize: 13, color: "#a8a29e", fontStyle: "italic", padding: "4px" }}>No options available. Click 'Edit Options' to add.</span>
        )}
      </div>
    </div>
  );
}