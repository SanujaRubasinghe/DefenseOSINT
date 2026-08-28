import type { TaskRecord } from "../api/types";
import StatusPill from "./StatusPill";

export default function TaskTable({ tasks }: { tasks: TaskRecord[] }) {
  if (tasks.length === 0) {
    return <p className="muted">No tasks yet — plan hasn't been created.</p>;
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
        {tasks.map((t) => (
          <tr key={t.task.task_id} className={t.error ? "task-row-error" : ""}>
            <td>{t.task.type}</td>
            <td className="task-objective">{t.task.objective}</td>
            <td>
              <StatusPill value={t.status} />
            </td>
            <td>{t.attempts}</td>
            <td>{t.evidence_count}</td>
            <td className="task-error-cell">{t.error ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
