import type { Place } from "places-shared/place";
import { asRecord, nonBlankText, type GeocodingSearchResult } from "places-shared/services";

export const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

export function isNominatimResponse(value: unknown): value is INominatimResponse {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;

  return typeof item.lat === 'string'
    && typeof item.lon === 'string'
    && typeof item.display_name === 'string'
    && Array.isArray(item.boundingbox)
    && item.boundingbox.every(entry => typeof entry === 'string');
}

export function parseNominatimResults(value: unknown): INominatimResponse[] {
  if (!Array.isArray(value) || !value.every(isNominatimResponse)) {
    throw new Error('Unexpected response format from Nominatim');
  }

  return value;
}

export function formatNominatimAddress(item: INominatimResponse): string {
  const address: string[] = [];
  
  if (item.address?.house_number && item.address?.road) {
    address.push(`${item.address.house_number} ${item.address.road}`);
  } else if (item.address?.road) {
    address.push(item.address.road);
  }
  
  if (item.address?.city) {
    address.push(item.address.city);
  } else if (item.address?.town) {
    address.push(item.address.town);
  } else if (item.address?.village) {
    address.push(item.address.village);
  }

  if (item.address?.state) {
    address.push(item.address.state);
  }

  if (item.address?.postcode) {
    address.push(item.address.postcode);
  }

  if (item.address?.country) {
    address.push(item.address.country);
  }

  return address.length > 0 ? address.join(", ") : item.display_name;
}

export function buildNominatimSearchUrl(query: string, country?: string, options?: { viewbox?: string; bounded?: boolean; limit?: number; extratags?: boolean }): string {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(options?.limit ?? 10),
    addressdetails: '1'
  });

  if (options?.extratags ?? true) {
    params.set('extratags', '1');
  }

  if (options?.viewbox) {
    params.set('viewbox', options.viewbox);
  }

  if (options?.bounded) {
    params.set('bounded', '1');
  }

  if (country) {
    params.set('countrycodes', country.toLowerCase());
  }

  const queryString = String(params);

  return `${NOMINATIM_BASE_URL}/search?${queryString}`;
}

export function nominatimPlace(item: INominatimResponse, fallbackAttribution?: string): Place {
  return {
    name: item.name && item.name.trim() ? item.name : "",
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lon),
    address: formatNominatimAddress(item),
    city: item.address?.city || item.address?.town || item.address?.village || item.address?.county || "",
    country: item.address?.country || "",
    state: item.address?.state || "",
    postalCode: item.address?.postcode || "",
    website: item.extratags?.website || "",
    tags: [item.class, item.type, item.addresstype].filter((tag): tag is string => typeof tag === "string" && Boolean(tag)),
    source: "nominatim",
    attribution: item.licence || fallbackAttribution || ""
  };
}

export interface INominatimResponse {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  address?: Address;
  extratags?: Record<string, string>;
  boundingbox: string[];
}

export interface Address {
  leisure?: string;
  house_number?: string;
  road?: string;
  town?: string;
  village?: string;
  county?: string;
  city?: string;
  state?: string;
  "ISO3166-2-lvl4"?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  protected_area?: string;
}

export function readNominatimSearchResults(value: unknown): GeocodingSearchResult[] {
  return (Array.isArray(value) ? value : []).flatMap((entry: unknown) => {
    const row = asRecord(entry);
    const lat = Number(row.lat);
    const lon = Number(row.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const address = asRecord(row.address);
    const extra = asRecord(row.extratags);
    const named = nonBlankText(row.name) ?? nonBlankText(row.display_name) ?? "Place";

    return [{
      name: named.split(",")[0].trim() || named,
      lat, lon,
      address: nonBlankText(row.display_name),
      website: nonBlankText(extra.website),
      tags: [nonBlankText(row.type), nonBlankText(row.class), nonBlankText(address.state)].filter((tag): tag is string => tag !== undefined),
      source: "nominatim",
    }];
  });
}
