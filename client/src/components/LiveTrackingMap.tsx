import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Truck } from "lucide-react";
import type { TrackingUpdate } from "@shared/schema";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface LiveTrackingMapProps {
  bookingId: string;
  trackingUpdates: TrackingUpdate[];
  pickupCoords: [number, number];
  deliveryCoords: [number, number];
}

export default function LiveTrackingMap({
  bookingId,
  trackingUpdates,
  pickupCoords,
  deliveryCoords,
}: LiveTrackingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: pickupCoords,
      zoom: 11,
    });

    // Add pickup marker
    new mapboxgl.Marker({ color: "#22c55e" })
      .setLngLat(pickupCoords)
      .setPopup(new mapboxgl.Popup().setHTML("<strong>Pickup Location</strong>"))
      .addTo(map.current);

    // Add delivery marker
    new mapboxgl.Marker({ color: "#D4AF37" })
      .setLngLat(deliveryCoords)
      .setPopup(new mapboxgl.Popup().setHTML("<strong>Delivery Location</strong>"))
      .addTo(map.current);

    // Add route line
    map.current.on("load", () => {
      if (!map.current) return;

      map.current.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [pickupCoords, deliveryCoords],
          },
        },
      });

      map.current.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 4,
          "line-opacity": 0.75,
        },
      });
    });

    // Fit bounds to show both markers
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(pickupCoords);
    bounds.extend(deliveryCoords);
    map.current.fitBounds(bounds, { padding: 100 });

    return () => {
      map.current?.remove();
    };
  }, [pickupCoords, deliveryCoords]);

  // Update live location from tracking updates
  useEffect(() => {
    if (trackingUpdates.length > 0 && map.current) {
      const latest = trackingUpdates[trackingUpdates.length - 1];
      const coords: [number, number] = [
        parseFloat(latest.lng as string),
        parseFloat(latest.lat as string),
      ];
      setCurrentLocation(coords);

      // Add/update truck marker
      const truckMarker = new mapboxgl.Marker({ color: "#0ea5e9" })
        .setLngLat(coords)
        .setPopup(
          new mapboxgl.Popup().setHTML(
            `<strong>Current Location</strong><br/>${latest.note || "In transit"}`
          )
        )
        .addTo(map.current);

      // Pan to current location
      map.current.flyTo({ center: coords, zoom: 13 });
    }
  }, [trackingUpdates]);

  const centerOnTruck = () => {
    if (currentLocation && map.current) {
      map.current.flyTo({ center: currentLocation, zoom: 14 });
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Navigation className="w-5 h-5 text-primary" />
          Live GPS Tracking
        </h3>
        {currentLocation && (
          <Button
            size="sm"
            variant="outline"
            onClick={centerOnTruck}
            data-testid="button-center-truck"
          >
            <Truck className="w-4 h-4 mr-2" />
            Center on Truck
          </Button>
        )}
      </div>

      <div
        ref={mapContainer}
        className="w-full h-[400px] rounded-lg border border-border"
        data-testid="map-container"
      />

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Pickup</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#D4AF37]" />
          <span>Delivery</span>
        </div>
        {currentLocation && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span>Live Location</span>
          </div>
        )}
      </div>
    </Card>
  );
}
