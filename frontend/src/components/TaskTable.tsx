import type { TaskRecord } from "../api/types";
import StatusPill from "./StatusPill";

export default function TaskTable({ tasks }: { tasks: TaskRecord[] }) {
  if (tasks.length === 0) {
    return <p className="empty-note">NO ACTIVE TASKING — plan has not been created yet.</p>;
  }

  return (
    <table className="task-table">
      <thead>
        <tr>
          <th>type</th>
          <th>objective</th>
          <th>status</th>
          <th>attempts</th>
          <th>evidence</th>
          <th>error</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t, i) => (
          <tr
            key={t.task.task_id}
            className={t.error ? "task-row-error" : ""}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <td className="task-type">{t.task.type}</td>
            <td className="task-objective">{t.task.objective}</td>
            <td>
              <StatusPill value={t.status} />
            </td>
            <td className="mono-cell">{t.attempts}</td>
            <td className="mono-cell">{t.evidence_count}</td>
            <td className="task-error-cell">{t.error ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
