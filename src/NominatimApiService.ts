import { Place } from "places-shared/place";
import { Coordinate, PlacesBoundingBox } from "places-shared/geo";
import { IPlaceExtensionSettings } from "places-shared/settings";
import { IPlacesService, parseNearQuery, lookupPlaceWithNearOrInQuery } from "places-shared/services";
import { logger } from "places-shared/utils";
import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { NominatimRateLimiter, NOMINATIM_HEADERS, NOMINATIM_BASE_URL } from "./NominatimRateLimiter";

function isNominatimResponse(value: unknown): value is INominatimResponse {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.lat === 'string'
    && typeof item.lon === 'string'
    && typeof item.display_name === 'string'
    && Array.isArray(item.boundingbox)
    && item.boundingbox.every(entry => typeof entry === 'string');
}

function parseNominatimResults(value: unknown): INominatimResponse[] {
  if (!Array.isArray(value) || !value.every(isNominatimResponse)) {
    throw new Error('Unexpected response format from Nominatim');
  }
  return value;
}

export class NominatimApiService implements IPlacesService {
  extensionSettings: IPlaceExtensionSettings;

  constructor(extensionSettings: IPlaceExtensionSettings) {
    this.extensionSettings = extensionSettings;
  }

  public async lookupPlace(query: string): Promise<Array<Place>> {
    return lookupPlaceWithNearOrInQuery(query, {
      search: (searchQuery) => this.executeSearch(searchQuery),
      geocodeLocation: (location, mode) => this.geocodeLocationBounds(location, mode),
      searchInBounds: (searchQuery, bounds) => this.lookupPlaceInBounds(searchQuery, bounds),
      combineFallbackQuery: (poi: string, location: string) => `${poi}, ${location}`,
      filterBoundedResults: true
    });
  }

  private formatAddress(item: INominatimResponse): string {
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

  private extractTags(item: INominatimResponse): string[] {
    const tags: string[] = [];

    if (item.class) {
      tags.push(item.class);
    }

    if (item.type) {
      tags.push(item.type);
    }

    if (item.addresstype) {
      tags.push(item.addresstype);
    }

    return tags.filter(tag => tag && typeof tag === 'string');
  }

  private extractPlaceName(item: INominatimResponse): string {
    if (item.name && item.name.trim()) {
      return item.name;
    }

    return "";
  }

  private async geocodeLocationBounds(location: string, mode: 'near' | 'in'): Promise<{ bounds: PlacesBoundingBox } | null> {
    await NominatimRateLimiter.waitForRateLimit();
    const url = this.buildSearchUrl(location, { limit: 1, extratags: false });
    const response = await requestUrl({ url, headers: NOMINATIM_HEADERS });
    const data = parseNominatimResults(response.json);

    if (!data || data.length === 0 || !data[0].boundingbox) {
      return null;
    }

    const [minLat, maxLat, minLng, maxLng] = data[0].boundingbox.map(Number);
    const bounds = new PlacesBoundingBox(minLat, minLng, maxLat, maxLng);
    if (mode === 'near') {
      bounds.applyPadding(0.5);
    }

    return { bounds };
  }

  public async lookupPlaceByCoordinates(coordinate: Coordinate): Promise<Place[]> {
    await NominatimRateLimiter.waitForRateLimit();
    const url = `${NOMINATIM_BASE_URL}/reverse?lat=${coordinate.latitude}&lon=${coordinate.longitude}&format=json&addressdetails=1&extratags=1&zoom=18&layer=poi`;

    const response = await requestUrl({ url, headers: NOMINATIM_HEADERS });
    const data: unknown = response.json;

    if (isNominatimResponse(data)) {
      return [this.mapResponseToPlace(data, "© OpenStreetMap contributors")];
    }

    return [];
  }

  public async lookupPlaceInBounds(query: string, bounds: PlacesBoundingBox): Promise<Place[]> {
    try {
      await NominatimRateLimiter.waitForRateLimit();
      const parsedQuery = parseNearQuery(query);
      const searchQuery = parsedQuery
        ? `${parsedQuery.poi}, ${parsedQuery.location}`
        : query;

      const viewbox = `${bounds.minLng},${bounds.maxLat},${bounds.maxLng},${bounds.minLat}`;
      const url = this.buildSearchUrl(searchQuery, { viewbox, bounded: true });
      const response = await requestUrl({ url, headers: NOMINATIM_HEADERS });
      const data = parseNominatimResults(response.json);

      const places: Array<Place> = data.map((item: INominatimResponse) => this.mapResponseToPlace(item));

      return places;
    } catch (error) {
      logger.scope('Places').error('[Nominatim] lookupPlaceInBounds error:', error);
      throw error;
    }
  }

  private async executeSearch(query: string): Promise<Place[]> {
    await NominatimRateLimiter.waitForRateLimit();
    const url = this.buildSearchUrl(query);
    const response = await requestUrl({ url, headers: NOMINATIM_HEADERS });
    const data = parseNominatimResults(response.json);
    return data.map((item: INominatimResponse) => this.mapResponseToPlace(item));
  }

  private buildSearchUrl(query: string, options?: { viewbox?: string; bounded?: boolean; limit?: number; extratags?: boolean }): string {
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

    if (this.extensionSettings.country) {
      params.set('countrycodes', this.extensionSettings.country.toLowerCase());
    }

    const queryString = String(params);
    return `${NOMINATIM_BASE_URL}/search?${queryString}`;
  }

  private mapResponseToPlace(item: INominatimResponse, fallbackAttribution?: string): Place {
    return {
      name: this.extractPlaceName(item),
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      address: this.formatAddress(item),
      city: item.address?.city || item.address?.town || item.address?.village || item.address?.county || "",
      country: item.address?.country || "",
      state: item.address?.state || "",
      postalCode: item.address?.postcode || "",
      website: item.extratags?.website || "",
      tags: this.extractTags(item),
      source: "nominatim",
      attribution: item.licence || fallbackAttribution || ""
    };
  }
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
