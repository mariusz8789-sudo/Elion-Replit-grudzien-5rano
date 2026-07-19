import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation, Truck } from "lucide-react";
import type { TrackingUpdate } from "@shared/schema";
import {
  haversineMeters,
  interpolateLngLat,
  interpolationDurationMs,
  type LngLat,
} from "@shared/mapInterpolation";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface LiveTrackingMapProps {
  bookingId: string;
  trackingUpdates: TrackingUpdate[];
  pickupCoords: [number, number];
  deliveryCoords: [number, number];
}

export default function LiveTrackingMap({
  trackingUpdates,
  pickupCoords,
  deliveryCoords,
}: LiveTrackingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const truckMarker = useRef<mapboxgl.Marker | null>(null);
  // The position currently painted on screen (which may be mid-glide, distinct from the
  // latest GPS target) and the in-flight animation frame, so a new ping can hand off smoothly
  // from wherever the marker actually is rather than snapping.
  const renderedPos = useRef<LngLat | null>(null);
  const animFrame = useRef<number | null>(null);
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
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
      map.current?.remove();
      truckMarker.current = null;
      renderedPos.current = null;
    };
  }, [pickupCoords, deliveryCoords]);

  // Update live location from tracking updates. Rather than snapping the marker from its old
  // coordinate to the new GPS ping, we glide it there with per-frame linear interpolation
  // (requestAnimationFrame) so movement reads as continuous, Uber-style motion. A ping that
  // arrives mid-glide cancels the current animation and re-targets from wherever the marker
  // actually is, so it never jumps.
  useEffect(() => {
    if (trackingUpdates.length === 0 || !map.current) return;
    const latest = trackingUpdates[trackingUpdates.length - 1];
    const target: LngLat = [parseFloat(latest.lng as string), parseFloat(latest.lat as string)];
    if (Number.isNaN(target[0]) || Number.isNaN(target[1])) return;
    setCurrentLocation(target);

    const popupHtml = `<strong>Current Location</strong><br/>${latest.note || "In transit"}`;

    // First fix: place the marker directly (nothing to glide from yet).
    if (!truckMarker.current) {
      truckMarker.current = new mapboxgl.Marker({ color: "#0ea5e9" })
        .setLngLat(target)
        .setPopup(new mapboxgl.Popup().setHTML(popupHtml))
        .addTo(map.current);
      renderedPos.current = target;
      map.current.easeTo({ center: target, duration: 800 });
      return;
    }

    truckMarker.current.getPopup()?.setHTML(popupHtml);

    const start = renderedPos.current ?? target;
    const distance = haversineMeters(start, target);
    if (distance < 0.5) {
      truckMarker.current.setLngLat(target);
      renderedPos.current = target;
      return;
    }

    const duration = interpolationDurationMs(distance);
    const startTime = performance.now();
    if (animFrame.current) cancelAnimationFrame(animFrame.current);

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const pos = interpolateLngLat(start, target, t);
      truckMarker.current?.setLngLat(pos);
      renderedPos.current = pos;
      if (t < 1) {
        animFrame.current = requestAnimationFrame(step);
      } else {
        animFrame.current = null;
      }
    };
    animFrame.current = requestAnimationFrame(step);

    // Gently keep the vehicle in view without yanking the zoom on every ping.
    map.current.easeTo({ center: target, duration: Math.min(duration, 1500) });
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
