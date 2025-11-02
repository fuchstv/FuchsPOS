import { create } from 'zustand';
import api from '../api/client';

export type CatalogItem = {
  id: string;
  name: string;
  price: number;
  category: 'Beverage' | 'Food' | 'Merch';
};

export type CartItem = {
  id: string;
  quantity: number;
};

export type PaymentState = 'idle' | 'processing' | 'success' | 'error';

type SaleResponse = {
  message: string;
  sale: {
    id: number;
    receiptNo: string;
    paymentMethod: string;
    total: number;
    status: string;
    createdAt: string;
    items: Array<{
      name: string;
      unitPrice: number;
      quantity: number;
    }>;
    reference?: string | null;
  };
};

type PosStore = {
  catalog: CatalogItem[];
  cart: CartItem[];
  paymentState: PaymentState;
  latestSale?: SaleResponse['sale'];
  error?: string;
  addToCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  simulatePayment: (paymentMethod: 'CARD' | 'CASH') => Promise<void>;
};

const catalog: CatalogItem[] = [
  { id: 'espresso', name: 'Espresso', price: 2.5, category: 'Beverage' },
  { id: 'flat-white', name: 'Flat White', price: 3.2, category: 'Beverage' },
  { id: 'iced-latte', name: 'Iced Latte', price: 3.8, category: 'Beverage' },
  { id: 'croissant', name: 'Butter Croissant', price: 2.1, category: 'Food' },
  { id: 'cheesecake', name: 'Cheesecake Slice', price: 3.5, category: 'Food' },
  { id: 'beans', name: 'House Blend Beans', price: 9.9, category: 'Merch' },
];

export const usePosStore = create<PosStore>((set, get) => ({
  catalog,
  cart: [],
  paymentState: 'idle',
  addToCart: id => {
    set(state => {
      const existing = state.cart.find(item => item.id === id);
      const updatedCart = existing
        ? state.cart.map(item =>
            item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
          )
        : [...state.cart, { id, quantity: 1 }];

      return {
        cart: updatedCart,
        error: undefined,
        paymentState: state.paymentState === 'success' ? 'idle' : state.paymentState,
      };
    });
  },
  removeFromCart: id => {
    set(state => {
      const existing = state.cart.find(item => item.id === id);
      if (!existing) {
        return state;
      }

      const updatedCart =
        existing.quantity === 1
          ? state.cart.filter(item => item.id !== id)
          : state.cart.map(item =>
              item.id === id ? { ...item, quantity: item.quantity - 1 } : item,
            );

      return {
        cart: updatedCart,
        error: undefined,
        paymentState: state.paymentState === 'success' ? 'idle' : state.paymentState,
      };
    });
  },
  clearCart: () =>
    set(state => ({
      cart: [],
      paymentState: 'idle',
      error: undefined,
      latestSale: state.latestSale,
    })),
  simulatePayment: async paymentMethod => {
    const state = get();
    if (state.cart.length === 0) {
      set({ error: 'Füge zuerst Produkte zum Warenkorb hinzu.' });
      return;
    }

    set({ paymentState: 'processing', error: undefined });

    try {
      const payload = {
        items: state.cart.map(item => {
          const product = state.catalog.find(productItem => productItem.id === item.id);
          if (!product) {
            throw new Error(`Produkt ${item.id} nicht gefunden`);
          }
          return {
            name: product.name,
            unitPrice: product.price,
            quantity: item.quantity,
          };
        }),
        paymentMethod,
      };

      const { data } = await api.post<SaleResponse>('/pos/payments/simulate', payload);

      set({
        paymentState: 'success',
        latestSale: data.sale,
        cart: [],
        error: undefined,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Zahlung konnte nicht simuliert werden.';
      set({ paymentState: 'error', error: message });
    }
  },
}));
