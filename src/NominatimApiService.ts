import { buildNominatimSearchUrl, isNominatimResponse, parseNominatimResults, nominatimPlace, type INominatimResponse } from "places-nominatim/core";
export type { INominatimResponse, Address } from "places-nominatim/core";
import { Place } from "places-shared/place";
import { Coordinate, PlacesBoundingBox } from "places-shared/geo";
import { IPlaceExtensionSettings } from "places-shared/settings";
import { IPlacesService, parseNearQuery, lookupPlaceWithNearOrInQuery } from "places-shared/services";
import { logger } from "places-shared/utils";
import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { NominatimRateLimiter, NOMINATIM_HEADERS, NOMINATIM_BASE_URL } from "./NominatimRateLimiter";

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

  private async geocodeLocationBounds(location: string, mode: 'near' | 'in'): Promise<{ bounds: PlacesBoundingBox } | null> {
    await NominatimRateLimiter.waitForRateLimit();
    const url = buildNominatimSearchUrl(location, this.extensionSettings.country, { limit: 1, extratags: false });
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
      return [nominatimPlace(data, "© OpenStreetMap contributors")];
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
      const url = buildNominatimSearchUrl(searchQuery, this.extensionSettings.country, { viewbox, bounded: true });
      const response = await requestUrl({ url, headers: NOMINATIM_HEADERS });
      const data = parseNominatimResults(response.json);

      const places: Array<Place> = data.map((item: INominatimResponse) => nominatimPlace(item));

      return places;
    } catch (error) {
      logger.scope('Places').error('[Nominatim] lookupPlaceInBounds error:', error);

      throw error;
    }
  }

  private async executeSearch(query: string): Promise<Place[]> {
    await NominatimRateLimiter.waitForRateLimit();
    const url = buildNominatimSearchUrl(query, this.extensionSettings.country);
    const response = await requestUrl({ url, headers: NOMINATIM_HEADERS });
    const data = parseNominatimResults(response.json);

    return data.map((item: INominatimResponse) => nominatimPlace(item));
  }
}
