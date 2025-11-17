import { create } from 'zustand';
import type {
  Address,
  CustomerDetails,
  FulfillmentSlot,
  FulfillmentType,
  OrderProduct,
  PaymentIntentResponse,
  SubmitOrderResponse,
} from '../api/order';
import { orderApi } from '../api/order';

export type CartItem = {
  productId: string;
  quantity: number;
};

export type PaymentMethod = 'card' | 'offline';

type OrderStore = {
  products: OrderProduct[];
  productsLoading: boolean;
  productsError?: string;
  cart: CartItem[];
  customer: CustomerDetails;
  address: Address;
  fulfillmentType: FulfillmentType;
  selectedSlot?: FulfillmentSlot;
  slotReservationToken?: string;
  slotOptions: FulfillmentSlot[];
  slotLoading: boolean;
  slotError?: string;
  paymentMethod: PaymentMethod;
  paymentIntent?: PaymentIntentResponse;
  paymentStatus: 'idle' | 'processing' | 'ready' | 'succeeded';
  isSubmitting: boolean;
  lastOrder?: SubmitOrderResponse;
  lastOrderItems?: {
    productId: string;
    name: string;
    description?: string;
    price: number;
    quantity: number;
  }[];
  orderError?: string;
  fetchProducts: () => Promise<void>;
  addToCart: (productId: string) => void;
  updateCartItem: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  resetCart: () => void;
  setCustomer: (payload: Partial<CustomerDetails>) => void;
  setAddress: (payload: Partial<Address>) => void;
  setFulfillmentType: (type: FulfillmentType) => void;
  fetchSlots: (type: FulfillmentType, date?: string) => Promise<void>;
  reserveSlot: (slot: FulfillmentSlot) => Promise<boolean>;
  setPaymentMethod: (method: PaymentMethod) => void;
  preparePayment: () => Promise<void>;
  submitOrder: () => Promise<SubmitOrderResponse>;
};

const defaultCustomer: CustomerDetails = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};

const defaultAddress: Address = {
  street: '',
  postalCode: '',
  city: '',
  country: 'Deutschland',
};

const calculateCartTotal = (cart: CartItem[], products: OrderProduct[]) => {
  return cart.reduce((total, item) => {
    const product = products.find(entry => entry.id === item.productId);
    if (!product) {
      return total;
    }
    return total + product.price * item.quantity;
  }, 0);
};

export const useOrderStore = create<OrderStore>((set, get) => ({
  products: [],
  productsLoading: false,
  cart: [],
  customer: defaultCustomer,
  address: defaultAddress,
  fulfillmentType: 'DELIVERY',
  slotOptions: [],
  slotLoading: false,
  paymentMethod: 'card',
  paymentStatus: 'idle',
  isSubmitting: false,
  fetchProducts: async () => {
    set({ productsLoading: true, productsError: undefined });
    try {
      const products = await orderApi.listProducts();
      set({ products, productsLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Produkte konnten nicht geladen werden.';
      set({ productsError: message, productsLoading: false });
    }
  },
  addToCart: productId => {
    set(state => {
      const cartItem = state.cart.find(item => item.productId === productId);
      if (cartItem) {
        return {
          cart: state.cart.map(item =>
            item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item,
          ),
        };
      }
      return { cart: [...state.cart, { productId, quantity: 1 }] };
    });
  },
  updateCartItem: (productId, quantity) => {
    set(state => {
      if (quantity <= 0) {
        return { cart: state.cart.filter(item => item.productId !== productId) };
      }
      return {
        cart: state.cart.map(item => (item.productId === productId ? { ...item, quantity } : item)),
      };
    });
  },
  removeFromCart: productId => {
    set(state => ({ cart: state.cart.filter(item => item.productId !== productId) }));
  },
  resetCart: () => set({ cart: [] }),
  setCustomer: payload => set(state => ({ customer: { ...state.customer, ...payload } })),
  setAddress: payload => set(state => ({ address: { ...state.address, ...payload } })),
  setFulfillmentType: type => set({ fulfillmentType: type, selectedSlot: undefined, slotReservationToken: undefined }),
  fetchSlots: async (type, date) => {
    set({ slotLoading: true, slotError: undefined });
    try {
      const slotOptions = await orderApi.fetchSlots({ type, date });
      set({ slotOptions, slotLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Slots konnten nicht geladen werden.';
      set({ slotLoading: false, slotError: message });
    }
  },
  reserveSlot: async slot => {
    set({ slotError: undefined });
    try {
      if (slot.remainingCapacity <= 0) {
        set({ slotError: 'Dieser Slot ist bereits voll ausgelastet.' });
        return false;
      }
      const { reservationToken, slot: refreshedSlot } = await orderApi.reserveSlot(slot.id);
      set({ selectedSlot: refreshedSlot, slotReservationToken: reservationToken });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Slot konnte nicht reserviert werden.';
      set({ slotError: message });
      return false;
    }
  },
  setPaymentMethod: method => set({ paymentMethod: method }),
  preparePayment: async () => {
    const state = get();
    const amount = calculateCartTotal(state.cart, state.products);
    if (!amount) {
      throw new Error('Der Warenkorb ist leer.');
    }
    set({ paymentStatus: 'processing', orderError: undefined });
    try {
      const paymentIntent = await orderApi.createPaymentIntent({
        amount,
        currency: 'EUR',
        customer: state.customer,
        cart: state.cart.map(item => ({ productId: item.productId, quantity: item.quantity })),
      });
      set({ paymentIntent, paymentStatus: paymentIntent.status === 'succeeded' ? 'succeeded' : 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Zahlung konnte nicht vorbereitet werden.';
      set({ paymentStatus: 'idle', orderError: message });
      throw error;
    }
  },
  submitOrder: async () => {
    const state = get();
    if (!state.cart.length) {
      throw new Error('Bitte legen Sie Produkte in den Warenkorb.');
    }
    if (!state.customer.firstName || !state.customer.lastName || !state.customer.email) {
      throw new Error('Bitte ergänzen Sie Ihre Kundendaten.');
    }
    if (!state.selectedSlot || !state.slotReservationToken) {
      throw new Error('Bitte reservieren Sie einen Liefer- oder Abholslot.');
    }
    if (state.paymentMethod === 'card' && !state.paymentIntent) {
      throw new Error('Bitte bereiten Sie die Kartenzahlung vor.');
    }
    set({ isSubmitting: true, orderError: undefined });
    try {
      const lastOrderItems = state.cart
        .map(item => {
          const product = state.products.find(entry => entry.id === item.productId);
          if (!product) {
            return undefined;
          }
          return {
            productId: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            quantity: item.quantity,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const response = await orderApi.submitOrder({
        cart: state.cart.map(item => ({ productId: item.productId, quantity: item.quantity })),
        customer: state.customer,
        address: state.address,
        fulfillment: {
          type: state.fulfillmentType,
          slotId: state.selectedSlot.id,
          reservationToken: state.slotReservationToken,
        },
        payment:
          state.paymentMethod === 'card'
            ? { method: 'card', intentId: state.paymentIntent!.intentId }
            : { method: 'offline', note: 'Bezahlung bei Abholung oder Lieferung' },
      });
      set({
        lastOrder: response,
        lastOrderItems,
        isSubmitting: false,
        cart: [],
        paymentIntent: undefined,
        selectedSlot: undefined,
        slotReservationToken: undefined,
        slotOptions: [],
        paymentStatus: 'idle',
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Die Bestellung konnte nicht abgeschlossen werden.';
      set({ isSubmitting: false, orderError: message });
      throw error;
    }
  },
}));

export const getCartTotal = () => {
  const state = useOrderStore.getState();
  return calculateCartTotal(state.cart, state.products);
};
