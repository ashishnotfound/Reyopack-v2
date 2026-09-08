export type AppRole = "super_admin" | "admin" | "worker";
export type OrderState = "pending" | "packed" | "cancelled";

export interface Viewer {
  id: string;
  displayName: string;
  email: string;
  role: AppRole;
  active: boolean;
}

export interface PackingInfo {
  id: string;
  workerId: string;
  workerDisplayName: string;
  packedAt: string;
}

export interface PackOrderItem {
  id: string;
  productId: string;
  title: string;
  sku: string;
  asin?: string | null;
  variation?: string | null;
  quantity: number;
  imageUrl?: string | null;
  location?: string | null;
}

export interface PackOrder {
  id: string;
  orderNumber: string;
  marketplaceOrderId: string;
  awb?: string | null;
  marketplace: string;
  state: OrderState;
  items: PackOrderItem[];
  packing: PackingInfo | null;
}

export interface PackingActivity {
  id: string;
  workerDisplayName: string;
  workerId: string;
  orderId: string;
  orderNumber: string;
  marketplaceOrderId: string;
  productTitle: string;
  sku: string;
  quantity: number;
  marketplace: string;
  packedAt: string;
}

export interface DashboardStats {
  total: number;
  packed: number;
  remaining: number;
  cancelled: number;
  activeWorkers: number;
}

export interface ProductSummary {
  id: string;
  sku: string;
  title: string;
  asin: string | null;
  active: boolean;
  location: string | null;
}

export interface WorkerSummary {
  id: string;
  displayName: string;
  email: string;
  role: AppRole;
  active: boolean;
  packedToday: number;
}

export interface LocationSummary {
  id: string;
  warehouseName: string;
  code: string;
  rack: string | null;
  shelf: string | null;
  bin: string | null;
  active: boolean;
}
