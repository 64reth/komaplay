// Re-encode browser uploads to remove metadata and keep feature artwork reasonably sized.
export async function prepareEditorialImage(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width * bitmap.height > 40_000_000 ||
      bitmap.width > 8000 ||
      bitmap.height > 8000
    )
      throw new Error("dimensions");
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("encode"))),
        "image/webp",
        0.86,
      ),
    );
    return new File([blob], "panel.webp", { type: blob.type });
  } finally {
    bitmap.close();
  }
}
