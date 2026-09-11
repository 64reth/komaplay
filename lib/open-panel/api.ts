export async function api<T>(action: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/open-panel/${action}`,
    body instanceof FormData
      ? { method: "POST", body }
      : body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : { cache: "no-store" },
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Open Panel is unavailable.");
  return data;
}
