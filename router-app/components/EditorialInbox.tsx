import { Form, Link, useNavigation } from "react-router";
import type { InboxEvent } from "../lib/inbox";
export function EditorialInbox({
  events,
  features,
  error,
}: {
  events: InboxEvent[];
  features: { id: string; slug: string; title: string }[];
  error?: string;
}) {
  const navigation = useNavigation();
  return (
    <section id="inbox" className="editorial-inbox">
      <h2 className="sr-only">Editorial messages</h2>
      {error && <p role="alert">{error}</p>}
      {events.length === 0 && (
        <p>
          No messages in this view. Editorial responses and publication updates will arrive here.
        </p>
      )}
      {events.map((event) => {
        const feature = features.find((f) => f.id === event.feature_id);
        return (
          <article
            key={event.id}
            className={event.read_at ? "inbox-read" : "inbox-unread"}
          >
            <p>
              <span className="op-eyebrow">
                {event.read_at ? "READ" : "UNREAD"} ·{" "}
                <time dateTime={event.created_at}>
                  {new Date(event.created_at).toLocaleDateString("en-GB")}
                </time>
              </span>
            </p>
            <p className="inbox-message">{event.message}</p>
            {feature ? (
              <Link
                to={`/features/${feature.slug}${event.kind === "status" || event.kind === "response" ? "/workshop" : ""}`}
              >
                {feature.title} →
              </Link>
            ) : (
              <span>Panel not currently public. </span>
            )}
            {event.kind === "editorial" && (
              <Link to={`/editorial?feature=${event.feature_id}`}>
                OPEN EDITORIAL WORK →
              </Link>
            )}
            <Form method="post">
              <input type="hidden" name="inboxId" value={event.id} />
              <button
                className="op-button"
                name="seen"
                value={event.read_at ? "false" : "true"}
                disabled={navigation.state !== "idle"}
              >
                {event.read_at ? "MARK UNREAD" : "MARK READ"}
              </button>
            </Form>
          </article>
        );
      })}
    </section>
  );
}
