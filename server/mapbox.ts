// @ts-ignore
import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding";
// @ts-ignore
import mbxDirections from "@mapbox/mapbox-sdk/services/directions";
import { env } from "./env";

if (!env.MAPBOX_TOKEN) {
  throw new Error("MAPBOX_TOKEN is required");
}

export const geocodingClient = mbxGeocoding({ accessToken: env.MAPBOX_TOKEN });
export const directionsClient = mbxDirections({ accessToken: env.MAPBOX_TOKEN });
