# Places - Nominatim

Search provider for [Places](https://community.obsidian.md/plugins/places) using [Nominatim](https://nominatim.org/), with POI search over OpenStreetMap data. It renders no map, so it pairs with any map provider.

This is not a stand-alone plugin, to use, install along side [Places](https://community.obsidian.md/plugins/places). Refer to the [sandbox](https://sandbox.obsidian.stanton.dev/places/) for examples.

## Network requests

| Area       | Request                                                     |
| ---------- | ----------------------------------------------------------- |
| POI search | Resolves a search term to place suggestions and coordinates |
| Reverse    | Resolves a coordinate to an address                         |

Requests go to `https://nominatim.openstreetmap.org`.

## Background tasks

None.

## Dependencies

| Library                                                      | Purpose                                        |
| ------------------------------------------------------------ | ---------------------------------------------- |
| [places-shared](https://github.com/bobstanton/places-shared) | Shared map, overlay, routing, and utility code |
