/** Strip descriptive/EXIF/XMP metadata without changing compressed pixel data. */
export function publicImageBytes(
  input: Uint8Array,
): { bytes: Uint8Array; type: string } | null {
  const text = (start: number, end: number) =>
    new TextDecoder().decode(input.slice(start, end));
  const join = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  if (input.length > 5 * 1024 * 1024 || input.length < 12) return null;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (
    input[0] === 137 &&
    text(1, 4) === "PNG" &&
    input[4] === 13 &&
    input[5] === 10 &&
    input[6] === 26 &&
    input[7] === 10
  ) {
    const parts = [input.slice(0, 8)];
    let at = 8;
    let pixels = false;
    while (at + 12 <= input.length) {
      const size = view.getUint32(at),
        end = at + size + 12;
      if (end > input.length) return null;
      const kind = text(at + 4, at + 8);
      if (!["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(kind))
        parts.push(input.slice(at, end));
      if (kind === "IDAT") pixels = true;
      if (kind === "IEND")
        return pixels ? { bytes: join(parts), type: "image/png" } : null;
      at = end;
    }
    return null;
  }
  if (input[0] === 255 && input[1] === 216) {
    const parts = [input.slice(0, 2)];
    let at = 2;
    while (at + 4 <= input.length) {
      if (input[at] !== 255) return null;
      const marker = input[at + 1];
      if (marker === 218) {
        parts.push(input.slice(at));
        return { bytes: join(parts), type: "image/jpeg" };
      }
      const end = at + 2 + view.getUint16(at + 2);
      if (end > input.length || end <= at + 2) return null;
      if (!(
        marker === 225 ||
        marker === 237 ||
        marker === 254 ||
        (marker >= 227 && marker <= 239)
      ))
        parts.push(input.slice(at, end));
      at = end;
    }
    return null;
  }
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    const parts = [input.slice(0, 12)];
    let at = 12;
    let pixels = false;
    while (at + 8 <= input.length) {
      const kind = text(at, at + 4),
        size = view.getUint32(at + 4, true),
        end = at + 8 + size + (size % 2);
      if (end > input.length) return null;
      if (!["EXIF", "XMP "].includes(kind)) {
        const chunk = input.slice(at, end);
        if (kind === "VP8X" && size >= 10) chunk[8] &= ~12;
        parts.push(chunk);
      }
      if (["VP8 ", "VP8L", "ANMF"].includes(kind)) pixels = true;
      at = end;
    }
    if (at !== input.length || !pixels) return null;
    const bytes = join(parts);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    return { bytes, type: "image/webp" };
  }
  return null;
}
