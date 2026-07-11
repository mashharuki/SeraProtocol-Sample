import QRCode from "qrcode";

/**
 * PNG QR code for a wallet address. Plain address (not an EIP-681 URI) —
 * every wallet, exchange app, and generic scanner can read it. Generated
 * locally so the address never leaves the bot.
 */
export async function addressQrPng(address: string): Promise<Buffer> {
  return QRCode.toBuffer(address, {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
