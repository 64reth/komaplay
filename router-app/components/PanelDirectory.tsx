import type { ReactNode } from "react";

export type PanelDirectoryRow = {
  id: string;
  title: ReactNode;
  type: ReactNode;
  status: ReactNode;
  date: ReactNode;
  meta?: ReactNode;
  action: ReactNode;
};

export function PanelDirectory({
  label,
  rows,
  empty,
}: {
  label: string;
  rows: PanelDirectoryRow[];
  empty: ReactNode;
}) {
  if (!rows.length) return <p className="panel-directory-empty">{empty}</p>;
  return (
    <div className="panel-directory" role="table" aria-label={label}>
      <div className="panel-directory-head" role="row">
        <span role="columnheader">Panel</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Date</span>
        <span role="columnheader">Action</span>
      </div>
      {rows.map((row) => (
        <div className="panel-directory-row" role="row" key={row.id}>
          <div className="panel-directory-title" role="cell" data-label="Panel">
            <strong>{row.title}</strong>
            {row.meta && <small>{row.meta}</small>}
          </div>
          <div role="cell" data-label="Type">{row.type}</div>
          <div role="cell" data-label="Status"><span className="panel-status">{row.status}</span></div>
          <div role="cell" data-label="Date">{row.date}</div>
          <div className="panel-directory-action" role="cell" data-label="Action">{row.action}</div>
        </div>
      ))}
    </div>
  );
}
