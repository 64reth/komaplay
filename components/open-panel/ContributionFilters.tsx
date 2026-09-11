"use client";
import { types, statuses } from "../../lib/open-panel/domain";
export type Filters = {
  type: string;
  status: string;
  feature_id: string;
  date: string;
};
export function ContributionFilters({
  value,
  onChange,
  features,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  features?: { id: string; title: string }[];
}) {
  return (
    <div className="op-filters">
      <label>
        Type
        <select
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value })}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value })}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {features && (
        <>
          <label>
            Feature
            <select
              value={value.feature_id}
              onChange={(e) =>
                onChange({ ...value, feature_id: e.target.value })
              }
            >
              <option value="">All features</option>
              {features.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Submitted since
            <input
              type="date"
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}
