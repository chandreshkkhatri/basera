import QRCode from "qrcode";

/**
 * Render a QR code as an inline SVG string, generated on the server so no QR
 * library ships to the client. Dark modules on a white quiet-zone keep it
 * scannable regardless of the page theme (callers wrap it on a white tile).
 */
export function qrCodeSvg(data: string, size = 160): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    margin: 1,
    width: size,
    errorCorrectionLevel: "M",
    color: { dark: "#111114", light: "#ffffff" },
  });
}
