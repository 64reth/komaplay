export const editorialImageBucket = "editorial-feature-images";
export const maxEditorialImageBytes = 5 * 1024 * 1024;
export const editorialImageMimeExtensions: Record<
  string,
  "png" | "jpg" | "webp"
> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function editorialImagePathPattern() {
  return /^editorial\/[0-9a-f-]{36}\/[a-z0-9-]{3,80}\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/;
}

export function slugPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function validateImageBytes(bytes: Uint8Array, type: string) {
  const png =
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return (
    (
      { "image/png": png, "image/jpeg": jpeg, "image/webp": webp } as Record<
        string,
        boolean
      >
    )[type] === true
  );
}

export function imageDimensions(
  bytes: Uint8Array,
  type: string,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === "image/png" && bytes.length >= 24)
      return { width: view.getUint32(16), height: view.getUint32(20) };
    if (type === "image/webp") {
      const kind = new TextDecoder().decode(bytes.slice(12, 16));
      if (kind === "VP8X" && bytes.length >= 30)
        return {
          width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
          height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
        };
      if (
        kind === "VP8 " &&
        bytes.length >= 30 &&
        bytes[23] === 0x9d &&
        bytes[24] === 1 &&
        bytes[25] === 0x2a
      )
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      if (kind === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f)
        return {
          width: 1 + ((bytes[22] & 0x3f) << 8) + bytes[21],
          height:
            1 + ((bytes[24] & 15) << 10) + (bytes[23] << 2) + (bytes[22] >> 6),
        };
    }
    if (type === "image/jpeg") {
      let offset = 2;
      while (offset + 4 < bytes.length) {
        if (bytes[offset++] !== 255) return null;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 0xda || marker === 0xd9) return null;
        const length = view.getUint16(offset);
        if (length < 2) return null;
        if ([0xc0, 0xc1, 0xc2].includes(marker))
          return {
            height: view.getUint16(offset + 3),
            width: view.getUint16(offset + 5),
          };
        offset += length;
      }
    }
  } catch {
    return null;
  }
  return null;
}
export function safeImageDimensions(
  size: { width: number; height: number } | null,
) {
  return (
    !!size &&
    size.width > 0 &&
    size.height > 0 &&
    size.width <= 8000 &&
    size.height <= 8000 &&
    size.width * size.height <= 40_000_000
  );
}
