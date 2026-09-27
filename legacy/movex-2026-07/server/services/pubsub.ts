import { Redis } from "ioredis";

export interface FanoutMessage {
  scope: "user" | "booking";
  id: string;
  payload: unknown;
}

/**
 * Cross-process fanout for WebSocket broadcasts. A single Node process's `userConnections`/
 * `bookingSubscriptions` maps (server/socket.ts) only know about sockets connected to that
 * process, so horizontally scaling to multiple instances/workers would silently drop
 * broadcasts to users connected elsewhere. Publishing through this interface instead of
 * writing directly to local sockets lets every instance react to every broadcast.
 */
export interface PubSubProvider {
  readonly isDistributed: boolean;
  publish(message: FanoutMessage): Promise<void>;
  onMessage(handler: (message: FanoutMessage) => void): void;
}

/**
 * Default, zero-dependency provider: delivers synchronously to local handlers only.
 * Correct and equivalent to the pre-pubsub behavior as long as there's exactly one process.
 */
class LocalPubSubProvider implements PubSubProvider {
  readonly isDistributed = false;
  private handlers: Array<(message: FanoutMessage) => void> = [];

  async publish(message: FanoutMessage): Promise<void> {
    for (const handler of this.handlers) handler(message);
  }

  onMessage(handler: (message: FanoutMessage) => void): void {
    this.handlers.push(handler);
  }
}

/**
 * Redis-backed provider: every instance publishes to and subscribes from the same channel,
 * so a broadcast issued on one instance reaches locally-connected sockets on every instance.
 */
class RedisPubSubProvider implements PubSubProvider {
  readonly isDistributed = true;
  private static readonly CHANNEL = "p2p:ws-fanout";
  private handlers: Array<(message: FanoutMessage) => void> = [];
  private publisher: Redis;
  private subscriber: Redis;

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
    this.publisher.on("error", (err) => console.error("Redis publisher error:", err.message));
    this.subscriber.on("error", (err) => console.error("Redis subscriber error:", err.message));

    this.subscriber.subscribe(RedisPubSubProvider.CHANNEL).catch((err) => {
      console.error("Failed to subscribe to WS fanout channel:", err.message);
    });
    this.subscriber.on("message", (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as FanoutMessage;
        for (const handler of this.handlers) handler(message);
      } catch {
        // Ignore malformed fanout messages rather than crash the process.
      }
    });
  }

  async publish(message: FanoutMessage): Promise<void> {
    await this.publisher.publish(RedisPubSubProvider.CHANNEL, JSON.stringify(message));
  }

  onMessage(handler: (message: FanoutMessage) => void): void {
    this.handlers.push(handler);
  }
}

let provider: PubSubProvider | undefined;

/**
 * Returns the process-wide pub/sub provider: Redis-backed if REDIS_URL is set (required for
 * correct WebSocket broadcasts once running more than one instance/worker), otherwise the
 * local no-op provider that preserves today's single-instance behavior exactly.
 */
export function getPubSubProvider(): PubSubProvider {
  if (!provider) {
    const redisUrl = process.env.REDIS_URL;
    provider = redisUrl ? new RedisPubSubProvider(redisUrl) : new LocalPubSubProvider();
  }
  return provider;
}
