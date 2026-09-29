import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePublicSupabaseConfig,
  publicSupabaseVariablePresence,
} from "../../router-app/lib/supabase-config";
import { publicImageBytes } from "../../router-app/lib/public-image-bytes";
import {
  publicMediaResponse,
  type MediaGateway,
} from "../../router-app/lib/public-media.server";
const account = "00000000-0000-4000-8000-000000000001";
const reference = "00000000-0000-4000-8000-000000000099";
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
const chunk = (type: string, body: string) => {
  const text = new TextEncoder().encode(body),
    bytes = new Uint8Array(text.length + 12);
  new DataView(bytes.buffer).setUint32(0, text.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(text, 8);
  return bytes;
};
const join = (...parts: Uint8Array[]) =>
  Uint8Array.from(parts.flatMap((p) => Array.from(p)));
const privatePng = join(
  png.slice(0, 33),
  chunk("tEXt", "Author\0" + account),
  chunk("eXIf", account),
  png.slice(33),
);
test("PNG descriptive metadata is removed while original pixel chunks remain intact", () => {
  const safe = publicImageBytes(privatePng);
  assert.equal(safe?.type, "image/png");
  assert.deepEqual(safe?.bytes, png);
  assert.ok(!new TextDecoder().decode(safe!.bytes).includes(account));
  assert.equal(publicImageBytes(new Uint8Array(20)), null);
});
test("JPEG EXIF and comments cannot carry account identifiers through the gateway", () => {
  const segment = (marker: number, value: string) => {
    const bytes = new TextEncoder().encode(value);
    return join(
      new Uint8Array([
        255,
        marker,
        (bytes.length + 2) >> 8,
        (bytes.length + 2) & 255,
      ]),
      bytes,
    );
  };
  const image = join(
    new Uint8Array([255, 216]),
    segment(225, account),
    segment(254, account),
    new Uint8Array([255, 218, 0, 2, 255, 217]),
  );
  const safe = publicImageBytes(image);
  assert.equal(safe?.type, "image/jpeg");
  assert.ok(!new TextDecoder().decode(safe!.bytes).includes(account));
});
test("WebP metadata is removed and container size is corrected", () => {
  const webpChunk = (type: string, value: string) => {
    const data = new TextEncoder().encode(value),
      out = new Uint8Array(8 + data.length + (data.length % 2));
    out.set(new TextEncoder().encode(type));
    new DataView(out.buffer).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  };
  const image = join(
    new TextEncoder().encode("RIFF0000WEBP"),
    webpChunk("VP8 ", "pixels"),
    webpChunk("EXIF", account),
    webpChunk("XMP ", account),
  );
  const safe = publicImageBytes(image);
  assert.equal(safe?.type, "image/webp");
  assert.ok(!new TextDecoder().decode(safe!.bytes).includes(account));
  assert.equal(
    new DataView(safe!.bytes.buffer).getUint32(4, true),
    safe!.bytes.length - 8,
  );
});
test("media gateway returns only bytes, never private paths, redirects or upstream errors", async () => {
  let downloaded = false;
  const service: MediaGateway = {
    resolve: async () => ({
      bucket: "open-panel-screenshots",
      path: account + "/00000000-0000-4000-8000-000000000044.png",
    }),
    download: async () => {
      downloaded = true;
      return privatePng;
    },
  };
  const response = await publicMediaResponse(reference, service);
  assert.equal(response.status, 200);
  assert.equal(downloaded, true);
  assert.equal(response.headers.get("Location"), null);
  assert.equal(response.headers.get("Content-Disposition"), null);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  for (const id of [account + "/file.png", "../" + reference, "bad"])
    assert.equal((await publicMediaResponse(id, service)).status, 404);
  assert.equal((await publicMediaResponse(reference, null)).status, 404);
  downloaded = false;
  assert.equal(
    (
      await publicMediaResponse(reference, {
        ...service,
        resolve: async () => null,
      })
    ).status,
    404,
  );
  assert.equal(downloaded, false);
  const failed = await publicMediaResponse(reference, {
    ...service,
    download: async () => {
      throw Error("private " + account);
    },
  });
  assert.equal(failed.status, 404);
  assert.ok(!(await failed.text()).includes(account));
});

test("media credential is never eligible for browser configuration or public diagnostics", () => {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_MEDIA_SERVICE_KEY: "private-media-sentinel",
  };
  assert.equal(resolvePublicSupabaseConfig(env), null);
  assert.ok(
    !JSON.stringify(publicSupabaseVariablePresence(env)).includes(
      "MEDIA_SERVICE",
    ),
  );
  assert.deepEqual(
    resolvePublicSupabaseConfig({ ...env, SUPABASE_ANON_KEY: "public-key" }),
    { url: env.SUPABASE_URL, key: "public-key" },
  );
});
