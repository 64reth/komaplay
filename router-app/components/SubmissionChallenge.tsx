import { useEffect, useRef, useState } from "react";
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
export function SubmissionChallenge({
  siteKey,
  attempt,
}: {
  siteKey: string;
  attempt: unknown;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState(
    "Complete the quick check before submitting.",
  );
  useEffect(() => {
    let widget: string | undefined,
      cancelled = false;
    const get = () =>
      (window as unknown as { turnstile?: Turnstile }).turnstile;
    const render = () => {
      if (cancelled || !container.current || widget) return;
      widget = get()?.render(container.current, {
        sitekey: siteKey,
        action: "editorial-submit",
        callback: () =>
          setMessage("Check complete. You can submit your panel."),
        "error-callback": () =>
          setMessage(
            "The check couldn’t finish. Reload the check or try again shortly.",
          ),
        "expired-callback": () =>
          setMessage("The check expired. Complete it again before submitting."),
      });
    };
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-koma-turnstile]",
    );
    if (!script) {
      script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.komaTurnstile = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    render();
    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
      if (widget) get()?.remove(widget);
    };
  }, [siteKey, attempt]);
  return (
    <section aria-label="Submission check">
      <p role="status">{message}</p>
      <div ref={container} />
    </section>
  );
}
