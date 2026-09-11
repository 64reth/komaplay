export async function publishingApi<T>(
  action: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/publication/${action}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Publishing request failed.");
  return data;
}
