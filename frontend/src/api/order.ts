import api from './client';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';

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
};
