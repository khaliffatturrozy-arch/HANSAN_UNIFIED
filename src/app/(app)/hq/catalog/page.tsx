import { requirePagePermission, requirePageSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { listCatalog, listCategories } from "@/modules/hq/hq-service";
import { actorCan } from "@/modules/identity/rbac";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatMoney } from "@/modules/shared/money";
import { titleCase } from "@/lib/format";
import { NewProductForm } from "./new-product-form";
import { ProductToggle } from "./product-toggle";

export const metadata = { title: "Catalog" };
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const session = await requirePageSession();
  requirePagePermission(session, "hq:view");
  const db = await readyDb();
  const [products, categories] = await Promise.all([
    listCatalog(db, session.actor),
    listCategories(db, session.actor),
  ]);
  const canManage = actorCan(session.actor, "hq:manage_catalog");
  const activeCount = products.filter((product) => product.active).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Headquarters / catalog"
        title="One menu, every surface."
        description="Products carry their station and base price. Every active outlet receives an availability row, so the POS and storefront read the same catalog version."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="h-badge">{products.length} products</span>
        <span className="h-badge h-badge-green">{activeCount} active</span>
        <span className="h-badge">{categories.length} categories</span>
        <span className="h-badge h-badge-blue">IDR</span>
      </div>

      <div className={`grid gap-6 ${canManage ? "xl:grid-cols-[1.5fr_0.5fr]" : ""}`}>
        <section className="h-card overflow-hidden" aria-labelledby="catalog-list">
          <div className="flex items-center justify-between gap-4 border-b border-ink/20 px-4 py-3">
            <div>
              <p className="h-label">Menu inventory</p>
              <h2 id="catalog-list" className="mt-0.5 text-lg font-extrabold">
                Products
              </h2>
            </div>
            <span className="h-badge">Tenant scoped</span>
          </div>

          {products.length === 0 ? (
            <EmptyState
              title="The catalog is empty"
              body="Add the first product to make it available in the POS and storefront."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="h-table">
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Product</th>
                    <th scope="col">Category</th>
                    <th scope="col">Station</th>
                    <th scope="col" className="text-right">Base price</th>
                    <th scope="col">Status</th>
                    {canManage ? <th scope="col" className="text-right">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="h-mono text-[11px] font-bold">{product.sku}</td>
                      <td>
                        <p className="font-extrabold">{product.name}</p>
                        {product.description ? (
                          <p className="mt-0.5 max-w-64 truncate text-[11px] text-muted">{product.description}</p>
                        ) : null}
                      </td>
                      <td>{product.categoryName}</td>
                      <td><span className="h-badge">{titleCase(product.station)}</span></td>
                      <td className="h-num text-right font-extrabold">{formatMoney(product.priceMinor)}</td>
                      <td><StatusBadge status={product.active ? "active" : "inactive"} /></td>
                      {canManage ? (
                        <td className="text-right">
                          <ProductToggle productId={product.id} active={product.active} name={product.name} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {canManage ? <NewProductForm categories={categories} /> : null}
      </div>

      {!canManage ? (
        <p className="mt-4 text-[11px] font-semibold text-muted">
          Your role can view the catalog but not change it. Owners, organisation administrators, and
          outlet managers can manage products.
        </p>
      ) : null}
    </div>
  );
}
