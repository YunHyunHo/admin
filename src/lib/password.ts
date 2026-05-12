import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const passwordPrefix = "scrypt";
const keyLength = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;

  return `${passwordPrefix}$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedPassword: string) {
  if (!storedPassword.startsWith(`${passwordPrefix}$`)) {
    return password === storedPassword;
  }

  const [, salt, storedKey] = storedPassword.split("$");

  if (!salt || !storedKey) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
  const storedBuffer = Buffer.from(storedKey, "hex");

  return (
    storedBuffer.length === derivedKey.length &&
    timingSafeEqual(storedBuffer, derivedKey)
  );
}
