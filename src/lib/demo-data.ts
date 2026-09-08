import type {
  DashboardStats,
  LocationSummary,
  PackOrder,
  PackingActivity,
  ProductSummary,
  Viewer,
  WorkerSummary,
} from "@/types/domain";

export const DEMO_USER: Viewer = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Reyo",
  email: "reyo@reyo.store",
  role: "super_admin",
  active: true,
};

export const DEMO_ORDER: PackOrder = {
  id: "10000000-0000-4000-8000-000000000001",
  orderNumber: "RP-0907-001",
  marketplaceOrderId: "408-1234567-1234567",
  awb: "AWB-REYO-24090701",
  marketplace: "Amazon India",
  state: "pending",
  items: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      productId: "30000000-0000-4000-8000-000000000001",
      title: "Frieren A4 Art Print",
      sku: "FRIEREN-A4-01",
      asin: "B0REY0PACK1",
      variation: "A4 · Matte",
      quantity: 1,
      imageUrl: null,
      location: "Rack A · Shelf 03 · Bin 12",
    },
  ],
  packing: null,
};

const now = Date.now();

export const DEMO_ACTIVITY: PackingActivity[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    workerDisplayName: "Reyo",
    workerId: DEMO_USER.id,
    orderId: "10000000-0000-4000-8000-000000000002",
    orderNumber: "RP-0907-002",
    marketplaceOrderId: "171-7654321-9876543",
    productTitle: "BMW M3 A4 Poster",
    sku: "BMW-M3-A4-02",
    quantity: 1,
    marketplace: "Amazon India",
    packedAt: new Date(now - 2 * 60_000).toISOString(),
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    workerDisplayName: "Worker 2",
    workerId: "00000000-0000-4000-8000-000000000002",
    orderId: "10000000-0000-4000-8000-000000000003",
    orderNumber: "RP-0907-003",
    marketplaceOrderId: "404-1111111-2222222",
    productTitle: "Porsche 911 A3 Poster",
    sku: "PORSCHE-911-A3",
    quantity: 2,
    marketplace: "Amazon India",
    packedAt: new Date(now - 7 * 60_000).toISOString(),
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    workerDisplayName: "Reyo",
    workerId: DEMO_USER.id,
    orderId: "10000000-0000-4000-8000-000000000004",
    orderNumber: "RP-0907-004",
    marketplaceOrderId: "FLP-OD4321098765",
    productTitle: "Blue Lock A4 Art Print",
    sku: "BLUELOCK-A4-04",
    quantity: 1,
    marketplace: "Flipkart",
    packedAt: new Date(now - 13 * 60_000).toISOString(),
  },
];

export const DEMO_STATS: DashboardStats = {
  total: 148,
  packed: 96,
  remaining: 48,
  cancelled: 4,
  activeWorkers: 3,
};

export const DEMO_PRODUCTS: ProductSummary[] = [
  {
    id: DEMO_ORDER.items[0].productId,
    sku: "FRIEREN-A4-01",
    title: "Frieren A4 Art Print",
    asin: "B0REY0PACK1",
    active: true,
    location: "A-03-12",
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    sku: "BMW-M3-A4-02",
    title: "BMW M3 A4 Poster",
    asin: "B0REY0PACK2",
    active: true,
    location: "B-01-04",
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    sku: "PORSCHE-911-A3",
    title: "Porsche 911 A3 Poster",
    asin: null,
    active: true,
    location: "B-02-08",
  },
];

export const DEMO_WORKERS: WorkerSummary[] = [
  {
    id: DEMO_USER.id,
    displayName: "Reyo",
    email: "reyo@reyo.store",
    role: "super_admin",
    active: true,
    packedToday: 52,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    displayName: "Worker 2",
    email: "worker2@reyo.store",
    role: "worker",
    active: true,
    packedToday: 44,
  },
];

export const DEMO_LOCATIONS: LocationSummary[] = [
  {
    id: "50000000-0000-4000-8000-000000000001",
    warehouseName: "Reyo Store — Main",
    code: "A-03-12",
    rack: "A",
    shelf: "03",
    bin: "12",
    active: true,
  },
  {
    id: "50000000-0000-4000-8000-000000000002",
    warehouseName: "Reyo Store — Main",
    code: "B-01-04",
    rack: "B",
    shelf: "01",
    bin: "04",
    active: true,
  },
];

export function demoLookup(query: string): PackOrder | null {
  const normalized = query.trim().toLowerCase();
  const searchable = [
    DEMO_ORDER.id,
    DEMO_ORDER.orderNumber,
    DEMO_ORDER.marketplaceOrderId,
    DEMO_ORDER.awb,
    DEMO_ORDER.items[0].sku,
  ].filter(Boolean) as string[];
  return searchable.some((value) => value.toLowerCase() === normalized)
    ? structuredClone(DEMO_ORDER)
    : null;
}
