export const MIB = 1024 * 1024;
export const mediaLimits = {
  avatar: {
    maxFileBytes: 2 * MIB,
    maxWidth: 2048,
    maxHeight: 2048,
    maxPixels: 4_194_304,
  },
  articleImage: {
    maxFileBytes: 10 * MIB,
    maxWidth: 8000,
    maxHeight: 8000,
    maxPixels: 40_000_000,
  },
  workshopImage: { maxFileBytes: 8 * MIB, maxFilesPerContribution: 4 },
  gallery: { maxFileBytesPerImage: 10 * MIB, maxImages: 12 },
  feature: { maxImageAssets: 40, maxTotalImageBytes: 150 * MIB },
  futureClip: {
    maxFileBytes: 100 * MIB,
    maxDurationSeconds: 60,
    maxWidth: 1920,
    maxHeight: 1080,
  },
} as const;
export const acceptedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export function imageError(
  file: { size: number; type: string },
  kind:
    "avatar" | "articleImage" | "workshopImage" | "gallery" = "articleImage",
) {
  const limit =
    kind === "gallery"
      ? mediaLimits.gallery.maxFileBytesPerImage
      : mediaLimits[kind].maxFileBytes;
  if (
    !acceptedImageTypes.includes(
      file.type as (typeof acceptedImageTypes)[number],
    )
  )
    return "This file format is unsupported";
  if (file.size > limit)
    return `File is larger than ${Math.round(limit / MIB)} MB`;
  return null;
}
const youtube =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
const twitch = /^https:\/\/(?:www\.)?twitch\.tv\/videos\/([0-9]+)(?:\?.*)?$/;
export function trustedVideo(url: string) {
  const value = url.trim();
  const yt = value.match(youtube);
  if (yt)
    return {
      provider: "youtube" as const,
      id: yt[1],
      embed: `https://www.youtube-nocookie.com/embed/${yt[1]}`,
    };
  const tw = value.match(twitch);
  if (tw)
    return {
      provider: "twitch" as const,
      id: tw[1],
      embed: `https://player.twitch.tv/?video=${tw[1]}&parent=${typeof location === "undefined" ? "localhost" : location.hostname}`,
    };
  return null;
}
