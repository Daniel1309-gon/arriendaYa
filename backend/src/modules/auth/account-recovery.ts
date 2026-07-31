import crypto from "crypto";
import { redisClient } from "../../db/redis";

export const ACCOUNT_RECOVERY_TOKEN_TTL_SECONDS = 10 * 60;
export const ACCOUNT_DELETION_GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function recoveryOtpKey(email: string) {
  return `account-recovery:otp:${normalizeEmail(email)}`;
}

function recoveryTokenKey(token: string) {
  return `account-recovery:token:${token}`;
}

function recoveryTokensByUserKey(userId: string) {
  return `account-recovery:tokens:${userId}`;
}

export async function createAccountRecoveryToken(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");

  await redisClient.setex(
    recoveryTokenKey(token),
    ACCOUNT_RECOVERY_TOKEN_TTL_SECONDS,
    userId,
  );
  await redisClient.sadd(recoveryTokensByUserKey(userId), token);
  await redisClient.expire(
    recoveryTokensByUserKey(userId),
    ACCOUNT_RECOVERY_TOKEN_TTL_SECONDS,
  );

  return token;
}

export async function getAccountRecoveryUserId(token: string) {
  return redisClient.get(recoveryTokenKey(token));
}

export async function consumeAccountRecoveryToken(
  userId: string,
  token: string,
) {
  await redisClient.del(recoveryTokenKey(token));
  await redisClient.srem(recoveryTokensByUserKey(userId), token);
}

export async function clearAccountRecoveryData(userId: string, email: string) {
  const tokenSetKey = recoveryTokensByUserKey(userId);
  const tokens = await redisClient.smembers(tokenSetKey);
  const tokenKeys = tokens.map(recoveryTokenKey);

  await redisClient.del(
    `user:${userId}:history`,
    `otp:${normalizeEmail(email)}`,
    recoveryOtpKey(email),
    tokenSetKey,
    ...tokenKeys,
  );
}
