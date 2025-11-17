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

export type FulfillmentSlot = {
  id: string;
  type: FulfillmentType;
  startsAt: string;
  endsAt: string;
  capacity: number;
  remainingCapacity: number;
  location?: string;
  instructions?: string;
};

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
    slotId: string;
    reservationToken?: string;
    instructions?: string;
  };
  payment: PaymentSubmission;
};

export const orderApi = {
  listProducts: async () => {
    const response = await api.get<OrderProduct[]>('/orders/products');
    return response.data;
  },
  fetchSlots: async (params: { type: FulfillmentType; date?: string }) => {
    const response = await api.get<FulfillmentSlot[]>('/orders/slots', { params });
    return response.data;
  },
  reserveSlot: async (slotId: string) => {
    const response = await api.post<{ reservationToken: string; slot: FulfillmentSlot }>(
      '/orders/slots/reservations',
      {
        slotId,
      },
    );
    return response.data;
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
