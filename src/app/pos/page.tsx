import { PosTerminal } from "./pos-terminal";

export const metadata = { title: "POS terminal" };

/**
 * The shell intentionally renders without a server session. All business data
 * is fetched from authenticated APIs, and a previously cached catalog allows a
 * reload while offline. The shell itself contains no tenant data.
 */
export default function PosPage() {
  return <PosTerminal />;
}
