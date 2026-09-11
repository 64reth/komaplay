import {
  canEdit,
  safeMedia,
  safeUrl,
  type Contribution,
} from "../../lib/open-panel/domain";
export function ContributionCard({
  item,
  onEdit,
  onWithdraw,
  onReview,
}: {
  item: Contribution;
  onEdit?: () => void;
  onWithdraw?: () => void;
  onReview?: () => void;
}) {
  return (
    <article className="op-card">
      <div className="op-card-meta">
        <span>
          {item.type} / {item.target_section}
        </span>
        <span className="op-badge">{item.status}</span>
      </div>
      <h3>{item.title}</h3>
      <p className="op-prose">{item.body}</p>
      <small>
        {item.author?.display_name ?? "Your contribution"} ·{" "}
        {new Date(item.created_at).toLocaleDateString("en-GB")}{" "}
        {item.feature && `· ${item.feature.title}`}
      </small>
      {item.source_url && safeUrl(item.source_url) && (
        <p>
          <a href={item.source_url} target="_blank" rel="noopener noreferrer">
            Source ↗
          </a>
        </p>
      )}
      {item.media_url && safeMedia(item.media_url) && (
        <p>
          <a href={item.media_url} target="_blank" rel="noopener noreferrer">
            Watch on {new URL(item.media_url).hostname} ↗
          </a>
        </p>
      )}
      {item.screenshot_path && (
        <a
          href={`/api/open-panel/image?path=${encodeURIComponent(item.screenshot_path)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View protected screenshot ↗
        </a>
      )}
      {item.moderator_note && (
        <p className="op-notice">Moderator note: {item.moderator_note}</p>
      )}
      <div className="op-actions">
        {onEdit && canEdit(item.status) && (
          <button onClick={onEdit}>Edit contribution</button>
        )}
        {onWithdraw && canEdit(item.status) && (
          <button onClick={onWithdraw}>Withdraw</button>
        )}
        {onReview && <button onClick={onReview}>Review contribution →</button>}
      </div>
    </article>
  );
}
