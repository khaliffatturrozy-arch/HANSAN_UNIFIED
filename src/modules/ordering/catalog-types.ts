export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  priceMinor: number;
  station: "kitchen" | "bar";
}

export interface OutletCatalog {
  outlet: {
    id: string;
    name: string;
    code: string;
    timezone: string;
    taxBps: number;
    serviceChargeBps: number;
  };
  categories: { id: string; name: string }[];
  products: CatalogProduct[];
  catalogVersion: string;
}
