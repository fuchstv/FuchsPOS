import api from './client';

export type EanLookupStatus = 'FOUND' | 'NOT_FOUND' | 'ERROR';

export type EanLookupResponse = {
  ean: string;
  status: EanLookupStatus;
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  mainCategory?: string | null;
  subCategory?: string | null;
  message?: string | null;
  raw: Record<string, string | null>;
};

/**
 * Looks up product metadata for a given EAN using the backend proxy.
 * @param ean - The barcode to search for.
 * @returns A promise that resolves to the lookup response.
 */
export async function lookupEan(ean: string) {
  const trimmed = ean.trim();
  if (!trimmed) {
    throw new Error('Bitte eine EAN eingeben.');
  }

  const { data } = await api.get<EanLookupResponse>(`/integrations/ean/${encodeURIComponent(trimmed)}`);
  return data;
}
