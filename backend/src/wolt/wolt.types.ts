export type WoltProduct = {
  id: string;
  name: string;
  price: number;
  sku?: string;
  raw?: Record<string, any>;
};

export type WoltOrderItem = {
  id?: string;
  name: string;
  quantity: number;
  price?: number;
};

export type WoltOrder = {
  id: string;
  status: string;
  statusText?: string;
  customer?: {
    name?: string;
  };
  pickupTime?: string;
  items: WoltOrderItem[];
  raw?: Record<string, any>;
};
