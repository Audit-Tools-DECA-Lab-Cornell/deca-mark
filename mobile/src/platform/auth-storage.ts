import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, hexToBytes } from "@noble/ciphers/utils.js";
import { getRandomBytesAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";

const keyName = "fieldmaps-auth-key";
const envelopeSchema = z.object({
  version: z.literal(1),
  nonce: z.string().regex(/^[a-f0-9]{24}$/),
  ciphertext: z.string().regex(/^(?:[a-f0-9]{2}){16,}$/),
});
const directory = () => new Directory(Paths.document, "auth");
const sessionFile = (storageKey: string) => new File(directory(), encodeURIComponent(storageKey));
let pending: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result;
  return result;
}

async function readKey(): Promise<Uint8Array | null> {
  const value = await SecureStore.getItemAsync(keyName);
  if (value === null) return null;
  if (!/^[a-f0-9]{64}$/.test(value)) return null;
  return hexToBytes(value);
}

async function read(storageKey: string): Promise<string | null> {
  try {
    const file = sessionFile(storageKey);
    if (!file.exists) return null;
    const key = await readKey();
    if (!key) return null;
    const envelope = envelopeSchema.parse(JSON.parse(file.textSync()));
    const plaintext = gcm(
      key,
      hexToBytes(envelope.nonce),
      new TextEncoder().encode(storageKey),
    ).decrypt(hexToBytes(envelope.ciphertext));
    const value = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    JSON.parse(value);
    return value;
  } catch (error) {
    // Corrupt or unavailable native storage is a signed-out boundary, never a plaintext fallback.
    if (error instanceof Error) return null;
    throw error;
  }
}

async function write(storageKey: string, value: string): Promise<void> {
  JSON.parse(value);
  let key = await readKey();
  if (!key) {
    key = await getRandomBytesAsync(32);
    await SecureStore.setItemAsync(keyName, bytesToHex(key));
  }
  const nonce = await getRandomBytesAsync(12);
  const ciphertext = gcm(key, nonce, new TextEncoder().encode(storageKey)).encrypt(
    new TextEncoder().encode(value),
  );
  directory().create({ intermediates: true, idempotent: true });
  sessionFile(storageKey).write(
    JSON.stringify({ version: 1, nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext) }),
  );
}

export const authStorage = {
  getItem: (storageKey: string) => serialize(() => read(storageKey)),
  setItem: (storageKey: string, value: string) => serialize(() => write(storageKey, value)),
  removeItem: (storageKey: string) =>
    serialize(async () => {
      const file = sessionFile(storageKey);
      if (file.exists) file.delete();
    }),
};
