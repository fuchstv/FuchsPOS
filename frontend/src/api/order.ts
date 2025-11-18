import api from './client';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';

export type OrderStatus =
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type OrderProduct = {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  availableQuantity: number;
  maxPerOrder?: number;
  category?: string;
  tags?: string[];
};

export type CartLinePayload = {
  productId: string;
  quantity: number;
};

export type CustomerDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type Address = {
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

type DeliverySlotUsage = {
  orders: number;
  kitchenLoad: number;
  storageLoad: number;
};

type DeliverySlotApiResponse = {
  id: number;
  tenantId: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  maxKitchenLoad: number;
  maxStorageLoad: number;
  notes?: string | null;
  usage: DeliverySlotUsage;
  remaining: DeliverySlotUsage;
};

export type FulfillmentSlot = DeliverySlotApiResponse & {
  type: FulfillmentType;
  notes?: string;
};

const customerTenantId =
  import.meta.env.VITE_CUSTOMER_TENANT_ID ?? import.meta.env.VITE_TENANT_ID ?? 'demo';

const toStartOfDay = (date?: string) => {
  const base = date ? new Date(date) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  return start;
};

const mapSlot = (slot: DeliverySlotApiResponse, type: FulfillmentType): FulfillmentSlot => ({
  ...slot,
  type,
  notes: slot.notes ?? undefined,
});

export type PaymentIntentResponse = {
  intentId: string;
  clientSecret?: string;
  status: 'requires_payment_method' | 'requires_action' | 'processing' | 'succeeded';
  amount: number;
  currency: string;
  provider: string;
};

export type SubmitOrderResponse = {
  orderId: string;
  reference: string;
  estimatedReadyAt?: string;
};

export type TrackingEvent = {
  id: number;
  status: OrderStatus;
  notes?: string | null;
  createdAt: string;
};

export type DriverLocationPoint = {
  id: number;
  latitude: number;
  longitude: number;
  driverStatus?: string | null;
  accuracy?: number | null;
  recordedAt: string;
};

export type NotificationPreference = {
  allowStatusPush: boolean;
  allowSlotUpdates: boolean;
  allowEmail: boolean;
  feedbackRequestedAt?: string | null;
};

export type TrackingSnapshot = {
  order: {
    id: number;
    status: OrderStatus;
    customerName: string;
    deliveryAddress?: string | null;
    totalAmount?: number | null;
    tenantId: string;
    slot: { id: number; startTime: string; endTime: string };
    driverAssignment?: {
      id: number;
      driverName?: string | null;
      vehicleId?: string | null;
      status: string;
      eta?: string | null;
      startedAt?: string | null;
      completedAt?: string | null;
    } | null;
  };
  statusEvents: TrackingEvent[];
  driverLocations: DriverLocationPoint[];
  notificationPreference: NotificationPreference;
  feedback?: {
    rating: number;
    comment?: string | null;
    tipAmount?: string | null;
    tipCurrency?: string | null;
    driverMood?: string | null;
  } | null;
  pushPublicKey: string;
  tipSuggestions: number[];
};

export type RegisterPushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  allowStatusPush?: boolean;
  allowSlotUpdates?: boolean;
  consentSource?: string;
};

export type SubmitFeedbackPayload = {
  rating: number;
  comment?: string;
  tipAmount?: number;
  tipCurrency?: string;
  driverMood?: string;
  contactConsent?: boolean;
};

export type PaymentSubmission =
  | { method: 'card'; intentId: string }
  | { method: 'offline'; note?: string };

export type OrderSubmissionPayload = {
  cart: CartLinePayload[];
  customer: CustomerDetails;
  address: Address;
  fulfillment: {
    type: FulfillmentType;
    slotId: number;
    instructions?: string;
  };
  payment: PaymentSubmission;
};

export const orderApi = {
  listProducts: async () => {
    const response = await api.get<OrderProduct[]>('/orders/products');
    return response.data;
  },
  fetchSlots: async ({ type, date }: { type: FulfillmentType; date?: string }) => {
    const from = toStartOfDay(date);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    const response = await api.get<DeliverySlotApiResponse[]>('/delivery-slots', {
      params: {
        tenantId: customerTenantId,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });
    return response.data.map(slot => mapSlot(slot, type));
  },
  reserveSlot: async ({
    slotId,
    type,
    kitchenLoad = 0,
    storageLoad = 0,
  }: {
    slotId: number;
    type: FulfillmentType;
    kitchenLoad?: number;
    storageLoad?: number;
  }) => {
    const response = await api.post<DeliverySlotApiResponse>(`/delivery-slots/${slotId}/reservations`, {
      kitchenLoad,
      storageLoad,
    });
    return mapSlot(response.data, type);
  },
  createPaymentIntent: async (payload: {
    amount: number;
    currency: string;
    customer: CustomerDetails;
    cart: CartLinePayload[];
  }) => {
    const response = await api.post<PaymentIntentResponse>('/orders/payment-intents', payload);
    return response.data;
  },
  submitOrder: async (payload: OrderSubmissionPayload) => {
    const response = await api.post<SubmitOrderResponse>('/orders', payload);
    return response.data;
  },
  fetchTracking: async (orderId: string | number) => {
    const response = await api.get<TrackingSnapshot>(`/orders/${orderId}/tracking`);
    return response.data;
  },
  registerPushSubscription: async (orderId: string | number, payload: RegisterPushSubscriptionPayload) => {
    const response = await api.post(`/orders/${orderId}/notifications/subscriptions`, payload);
    return response.data;
  },
  updateNotificationPreferences: async (
    orderId: string | number,
    payload: Partial<NotificationPreference>,
  ) => {
    const response = await api.patch<NotificationPreference>(
      `/orders/${orderId}/notifications/preferences`,
      payload,
    );
    return response.data;
  },
  submitFeedback: async (orderId: string | number, payload: SubmitFeedbackPayload) => {
    const response = await api.post<TrackingSnapshot['feedback']>(`/orders/${orderId}/feedback`, payload);
    return response.data;
  },
};
