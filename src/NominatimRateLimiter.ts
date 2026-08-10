import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { FixedIntervalRateLimiter } from "places-shared/services";

const NOMINATIM_USER_AGENT = "ObsidianPlacesPlugin/1.0 (https://github.com/bobstanton/places-nominatim)";

export const NOMINATIM_HEADERS = {
  "User-Agent": NOMINATIM_USER_AGENT,
  "Accept": "application/json"
};

export const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

class NominatimRateLimiterClass {
  private limiter = new FixedIntervalRateLimiter(1100);

  async waitForRateLimit(): Promise<void> {
    await this.limiter.wait();
  }

  async request<T>(url: string): Promise<T> {
    await this.waitForRateLimit();

    const response = await requestUrl({
      url,
      method: "GET",
      headers: NOMINATIM_HEADERS
    });

    if (response.status !== 200) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    return response.json as T;
  }
}

export const NominatimRateLimiter = new NominatimRateLimiterClass();
