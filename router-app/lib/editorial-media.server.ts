export const editorialImageBucket = "editorial-feature-images";
export const maxEditorialImageBytes = 5 * 1024 * 1024;
export const editorialImageMimeExtensions: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function editorialImagePathPattern() {
  return /^editorial\/[0-9a-f-]{36}\/[a-z0-9-]{3,80}\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/;
}

export function slugPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function validateImageBytes(bytes: Uint8Array, type: string) {
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return ({ "image/png": png, "image/jpeg": jpeg, "image/webp": webp } as Record<string, boolean>)[type] === true;
}
