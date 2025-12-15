import bcrypt from "bcryptjs";
import crypto from "crypto";

export const doHash = async (value, saltValue) => {
  return bcrypt.hash(value, saltValue);
};

export const dohashValidation = async (value, hashedValue) => {
  return bcrypt.compare(value, hashedValue);
};

export const hmacProcess = (value, key) => {
  return crypto
    .createHmac("sha256", key)
    .update(value)
    .digest("hex");
};
