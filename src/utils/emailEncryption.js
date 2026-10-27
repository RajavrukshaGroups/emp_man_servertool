import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const getEncryptionKey = () => {
  const keyHex = process.env.EMAIL_ENCRYPTION_KEY;

  if (!keyHex || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error(
      "EMAIL_ENCRYPTION_KEY must be a valid 256-bit hexadecimal key.",
    );
  }

  return Buffer.from(keyHex, "hex");
};

/**
 * Encrypt company SMTP credentials before storing them.
 */
export const encryptEmailCredential = (plainText) => {
  if (typeof plainText !== "string" || !plainText) {
    throw new Error("Email credential cannot be empty.");
  }

  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
};

/**
 * Decrypt credentials only when sending emails.
 */
export const decryptEmailCredential = (encryptedValue) => {
  const parts = encryptedValue?.split(":");

  if (
    !parts ||
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    !/^[a-f0-9]{24}$/i.test(parts[1]) ||
    !/^[a-f0-9]{32}$/i.test(parts[2]) ||
    !/^(?:[a-f0-9]{2})+$/i.test(parts[3])
  ) {
    throw new Error("Invalid encrypted email credential format.");
  }

  const [, ivHex, tagHex, encryptedHex] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid authentication tag.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
