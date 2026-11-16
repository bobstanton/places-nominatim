import { App, Plugin } from "obsidian";
import { IPlaceExtensionSettings, IPlacesExtensionHostSettings } from "places-shared/settings";
import { IPlacePluginExtension, IPlacePluginExtensionExports, registerPlaceExtensionLifecycle, PLACES_EXTENSION_API_VERSION, type ExtensionSettingsGroup } from "places-shared/obsidian/services";
import { Utilities, configureRequestLogging } from "places-shared/utils";
import { countrySettingItem } from "places-shared/obsidian/ui";
import { NominatimApiService } from "./NominatimApiService";
import { PROVIDER_ICON } from "./provider-icon";

export default class NominatimPlugin extends Plugin implements IPlacePluginExtension {
  onload() {
    registerPlaceExtensionLifecycle(this);
  }

  getPlaceExports(_app: App, extensionSettings: IPlaceExtensionSettings, mainSettings: IPlacesExtensionHostSettings): IPlacePluginExtensionExports {
    configureRequestLogging(mainSettings.developerMode);
    Utilities.applyDefaults(extensionSettings, DEFAULT_SETTINGS);
    const placesService = new NominatimApiService(extensionSettings);

    return {
      apiVersion: PLACES_EXTENSION_API_VERSION,
      providers: [
        {
          name: "nominatim",
          geocoding: {
            service: placesService,
            icon: PROVIDER_ICON
          },
        }
      ],
      settingsGroup: this.settingsGroup(extensionSettings)
    };
  }

  private settingsGroup(settings: IPlaceExtensionSettings): ExtensionSettingsGroup {
    return {
      heading: "Nominatim",
      displayValue: () => settings.country?.toUpperCase() || "All countries",
      items: [countrySettingItem()],
    };
  }
}

const DEFAULT_SETTINGS: IPlaceExtensionSettings = {
  country: "us"
};
