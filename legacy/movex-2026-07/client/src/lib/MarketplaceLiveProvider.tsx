import { useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "./auth";
import { queryClient } from "./queryClient";
import { useToast } from "@/hooks/use-toast";

interface NewJobPayload {
  id: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  totalPrice?: string;
}

/**
 * Keeps a carrier's available-jobs feed live. While a company member is signed in, this holds
 * a WebSocket to the server (auto-reconnecting with backoff) and, whenever a customer publishes
 * a new public booking, refreshes the public-bookings feed and raises a toast - so companies
 * discover fresh jobs the instant they are posted instead of polling the marketplace.
 *
 * Customers and admins get no socket here (they don't bid), and the effect no-ops until a
 * company user is present, so it costs nothing for non-carrier sessions.
 */
export function MarketplaceLiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const userId = user?.id;
  const companyId = user?.companyId;

  useEffect(() => {
    if (!userId || !companyId) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;
    let attempts = 0;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      socket.onopen = () => {
        attempts = 0;
      };

      socket.onmessage = (event) => {
        let data: { type?: string; booking?: NewJobPayload };
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type !== "marketplace:new_job") return;

        // Live-refresh the available-jobs feed shown on the company dashboard.
        queryClient.invalidateQueries({ queryKey: ["/api/bookings/public"] });

        const b = data.booking;
        const route = b?.pickupAddress && b?.deliveryAddress ? `${b.pickupAddress} → ${b.deliveryAddress}` : undefined;
        toastRef.current({
          title: "New job on the marketplace",
          description: route
            ? `${route}${b?.totalPrice ? ` · €${b.totalPrice}` : ""}`
            : "A new public booking is available to bid on.",
        });
      };

      socket.onclose = () => {
        if (closedByUs) return;
        // Reconnect with exponential backoff (capped) so a dropped connection self-heals.
        attempts += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** attempts);
        reconnectTimer = setTimeout(connect, delay);
      };

      // Let onclose drive reconnection; swallow the error event itself.
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [userId, companyId]);

  return <>{children}</>;
}
