/**
 * uuid_int encoding for Sera orders.
 *
 * Bit layout (uint256):
 *   [255:252] Executor ID (4 bits)
 *   [251:124] Order ID   (128 bits — the UUID4 as an integer)
 *   [123:12]  Group ID   (112 bits)
 *   [11:0]    Leg ID     (12 bits)
 *
 * Standalone order: group_id = order_id >> 16, leg_id = 0.
 * The API rejects submissions where uuid_int doesn't match order_id.
 */

const MASK_128 = (1n << 128n) - 1n;
const MASK_112 = (1n << 112n) - 1n;
const MASK_12 = (1n << 12n) - 1n;

export function uuidToBigInt(uuid: string): bigint {
  const hex = uuid.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  return BigInt(`0x${hex}`);
}

export function encodeUuidInt(
  orderId: string,
  opts: { executor?: bigint; groupId?: bigint; legId?: bigint } = {},
): bigint {
  const id = uuidToBigInt(orderId);
  const executor = opts.executor ?? 0n;
  const groupId = (opts.groupId ?? id >> 16n) & MASK_112;
  const legId = (opts.legId ?? 0n) & MASK_12;
  if (executor > 0xfn) throw new Error("executor must fit in 4 bits");
  return (executor << 252n) | (id << 124n) | (groupId << 12n) | legId;
}

export interface DecodedUuidInt {
  executor: bigint;
  orderId: bigint;
  groupId: bigint;
  legId: bigint;
}

export function decodeUuidInt(uuidInt: bigint): DecodedUuidInt {
  return {
    executor: uuidInt >> 252n,
    orderId: (uuidInt >> 124n) & MASK_128,
    groupId: (uuidInt >> 12n) & MASK_112,
    legId: uuidInt & MASK_12,
  };
}

export function bigIntToUuid(value: bigint): string {
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
