export const pausedMessage =
  "We’ve received several requests in a short time, so this action has been paused briefly. Your work is safe—please try again in a few minutes.";
export const staleMessage =
  "This panel has changed since you opened it. Your edits are still here. Copy any changes you want to keep, then reopen the latest version before saving.";
export function actionFailure(error: unknown, fallback: string) {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  return code === "P4290"
    ? pausedMessage
    : code === "P4090"
      ? staleMessage
      : fallback;
}
