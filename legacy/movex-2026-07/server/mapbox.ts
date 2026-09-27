// @ts-expect-error - @mapbox/mapbox-sdk ships no type declarations for this subpath
import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding.js";
// @ts-expect-error - @mapbox/mapbox-sdk ships no type declarations for this subpath
import mbxDirections from "@mapbox/mapbox-sdk/services/directions.js";
import { env } from "./env";

// Constructed lazily so a deployment without a Mapbox token configured can still boot
// and serve every non-map feature; every call site must check isMapboxConfigured() first
// and return a clear 503/error rather than calling these unconditionally.
let geocodingClientInstance: ReturnType<typeof mbxGeocoding> | null = null;
let directionsClientInstance: ReturnType<typeof mbxDirections> | null = null;

export function isMapboxConfigured(): boolean {
  return Boolean(env.MAPBOX_TOKEN);
}

export function getGeocodingClient(): ReturnType<typeof mbxGeocoding> {
  if (!geocodingClientInstance) {
    if (!env.MAPBOX_TOKEN) {
      throw new Error("Mapbox is not configured: MAPBOX_TOKEN is not set");
    }
    geocodingClientInstance = mbxGeocoding({ accessToken: env.MAPBOX_TOKEN });
  }
  return geocodingClientInstance;
}

export function getDirectionsClient(): ReturnType<typeof mbxDirections> {
  if (!directionsClientInstance) {
    if (!env.MAPBOX_TOKEN) {
      throw new Error("Mapbox is not configured: MAPBOX_TOKEN is not set");
    }
    directionsClientInstance = mbxDirections({ accessToken: env.MAPBOX_TOKEN });
  }
  return directionsClientInstance;
}
