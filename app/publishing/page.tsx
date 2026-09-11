import { EditorialHeader } from "../../components/EditorialNavigation";
import { PublishingCalendar } from "../../components/publication/PublishingCalendar";
export const dynamic = "force-dynamic";
export default function PublishingPage() {
  return (
    <main className="editorial-page">
      <EditorialHeader />
      <div className="op-workspace">
        <p className="op-eyebrow editorial-marker">
          KOMA://PLAY / PUBLISHING DESK
        </p>
        <h1>Issues & drops</h1>
        <p>
          New panels every week. New issues every month. Open Panels close when
          the issue ends.
        </p>
        <PublishingCalendar />
      </div>
    </main>
  );
}
