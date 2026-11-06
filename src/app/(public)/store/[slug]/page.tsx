import { notFound } from "next/navigation";
import { getPublicStorefront } from "@/modules/ordering/catalog";
import { isAppError, ERROR_CODES } from "@/modules/shared/errors";
import { readyDb } from "@/lib/server";
import { isDemoMode } from "@/lib/env";
import { StoreOrder } from "./store-order";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const storefront = await getPublicStorefront(await readyDb(), slug);
    return { title: `Order from ${storefront.tenant.name}` };
  } catch {
    return { title: "Storefront not found" };
  }
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let storefront;
  try {
    storefront = await getPublicStorefront(await readyDb(), slug);
  } catch (error) {
    if (isAppError(error) && error.code === ERROR_CODES.NOT_FOUND) notFound();
    throw error;
  }

  return <StoreOrder storefront={storefront} demoMode={isDemoMode()} />;
}
