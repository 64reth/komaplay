import Link from "next/link";
import { AuthGate } from "../../../components/open-panel/AuthGate";
import { HandbookManager } from "../../../components/handbook/HandbookManager";
export default function HandbookManagePage() {
  return (
    <main className="editorial-page">
      <div className="op-workspace handbook-page">
        <Link href="/handbook">← Community handbook</Link>
        <p className="op-eyebrow">EDITORIAL DESK</p>
        <h1>Handbook management</h1>
        <AuthGate moderator>
          {(user) =>
            user.role === "admin" ? (
              <HandbookManager />
            ) : (
              <p role="alert">Administrator access is required.</p>
            )
          }
        </AuthGate>
      </div>
    </main>
  );
}
