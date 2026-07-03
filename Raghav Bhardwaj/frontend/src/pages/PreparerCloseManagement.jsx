import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  ListTodo,
  MoreVertical,
  Calendar,
  Building2,
  Database,
  FileText,
  Search,
  Calculator,
  KanbanSquare
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import client from '../api/client';

const PriorityBadge = ({ priority }) => {
  const styles = {
    Critical: 'bg-[var(--bad-bg)] text-[var(--bad)] border-[var(--bad-bdr)]',
    High: 'bg-[var(--warn-bg)] text-[var(--warn)] border-[var(--warn-bdr)]',
    Medium: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-bdr)]',
    Low: 'bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-2)]'
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[priority] || styles.Low}`}>
      {priority}
    </span>
  );
};

const TaskCard = ({ task }) => {
  const Icon = task.icon || Database;
  
  return (
    <div 
      draggable
      onDragStart={(e) => e.dataTransfer.setData('taskId', task.id.toString())}
      className="premium-card micro-anim p-4 cursor-pointer hover:border-[var(--accent-border)] group relative"
    >
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 pr-6">
          {task.title}
        </h4>
        <button className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] absolute top-4 right-4">
          <MoreVertical size={16} />
        </button>
      </div>
      
      <div className="flex items-center gap-2 mb-4 text-sm text-[var(--text-secondary)]">
        <Icon size={14} className="text-[var(--text-tertiary)]" />
        <span>{task.type}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-y-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Building2 size={13} className="text-[var(--text-tertiary)]" />
          <span className="truncate">{task.entity}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Calendar size={13} className="text-[var(--text-tertiary)]" />
          <span>{task.dueDate}</span>
        </div>
      </div>
      
      <div className="flex justify-between items-center pt-3 border-t border-[var(--border-1)]">
        <PriorityBadge priority={task.priority} />
        {task.completedAt ? (
          <span className="text-xs text-[var(--ok)] flex items-center gap-1">
            <CheckCircle2 size={12} />
            Done
          </span>
        ) : (
          <div className="flex -space-x-2">
            <div className="w-6 h-6 rounded-full bg-[var(--surface-4)] border border-[var(--surface-2)] flex items-center justify-center text-[10px] text-[var(--text-primary)]">
              RB
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Column = ({ title, status, icon: Icon, tasks, countColor, onDrop }) => {
  return (
    <div 
      className="flex flex-col h-full"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId && onDrop) {
          onDrop(taskId, status);
        }
      }}
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <Icon size={18} className={countColor} />
          <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-3)] ${countColor}`}>
          {tasks.length}
        </span>
      </div>
      <div className="glass-panel flex-1 p-3 rounded-[var(--r-lg)] space-y-3 overflow-y-auto min-h-[500px]">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] text-sm border-2 border-dashed border-[var(--border-1)] rounded-[var(--r-md)]">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
};

export default function PreparerCloseManagement() {
  const [tasks, setTasks] = useState({ todo: [], inProgress: [], completed: [] });

  const fetchTasks = async () => {
    try {
      const res = await client.get('/api/v1/close-tasks');
      const newTasks = { todo: [], inProgress: [], completed: [] };
      res.data.forEach(t => {
        const mappedTask = {
          id: t.id,
          title: t.task_name,
          type: t.task_type,
          entity: t.profile_id ? `Profile ${t.profile_id}` : 'Global',
          dueDate: t.due_date || 'N/A',
          priority: 'Medium',
          status: t.status,
          completedAt: t.completed_at,
          icon: Database 
        };
        if (t.status === 'NOT_STARTED') newTasks.todo.push(mappedTask);
        else if (t.status === 'IN_PROGRESS') newTasks.inProgress.push(mappedTask);
        else if (t.status === 'COMPLETE') newTasks.completed.push(mappedTask);
      });
      setTasks(newTasks);
    } catch (error) {
      console.error('Failed to fetch tasks', error);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleDrop = async (taskId, newStatus) => {
    try {
      await client.patch(`/api/v1/close-tasks/${taskId}`, { status: newStatus });
      fetchTasks();
    } catch (error) {
      console.error('Failed to update task status', error);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)] flex flex-col">
      <PageHeader 
        title="Preparer Close Management"
        description="Manage your period-end tasks and checklist across entities."
        icon={KanbanSquare}
        actions={
          <button className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--r-md)] font-medium hover:bg-[var(--accent-hover)] transition-colors micro-anim flex items-center gap-2 text-sm shadow-[var(--shadow-sm)]">
            <Search size={16} />
            Filter Tasks
          </button>
        }
      />
      
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 h-full min-h-0">
          <Column 
            title="To Do" 
            status="NOT_STARTED"
            icon={ListTodo} 
            tasks={tasks.todo} 
            countColor="text-[var(--text-secondary)]" 
            onDrop={handleDrop}
          />
          <Column 
            title="In Progress" 
            status="IN_PROGRESS"
            icon={Clock} 
            tasks={tasks.inProgress} 
            countColor="text-[var(--info)]" 
            onDrop={handleDrop}
          />
          <Column 
            title="Completed" 
            status="COMPLETE"
            icon={CheckCircle2} 
            tasks={tasks.completed} 
            countColor="text-[var(--ok)]" 
            onDrop={handleDrop}
          />
        </div>
      </main>
    </div>
  );
}
