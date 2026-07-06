import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { Express } from "express";
import { parse as parseCookie } from "cookie";
import type { RequestHandler } from "express";
import { log } from "./vite";
import type { IStorage } from "./storage";

interface WebSocketWithAuth extends WebSocket {
  id: string;
  userId: string;
}

interface WSMessage {
  type: "subscribe" | "unsubscribe" | "call:invite" | "call:offer" | "call:answer" | "call:ice-candidate" | "call:reject" | "call:end";
  bookingId?: string;
  callId?: string;
  targetUserId?: string;
  callType?: "voice" | "video";
  sdp?: unknown;
  candidate?: unknown;
}

const CALL_MESSAGE_TYPES = new Set([
  "call:invite",
  "call:offer",
  "call:answer",
  "call:ice-candidate",
  "call:reject",
  "call:end",
]);

const MAX_MESSAGE_SIZE = 100 * 1024; // 100KB
const MESSAGE_RATE_LIMIT = 10; // messages per second
const messageRates = new Map<string, number[]>();

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const rates = messageRates.get(clientId) || [];
  const recentRates = rates.filter(time => now - time < 1000);
  
  if (recentRates.length >= MESSAGE_RATE_LIMIT) {
    return false;
  }
  
  recentRates.push(now);
  messageRates.set(clientId, recentRates);
  return true;
}

export function setupWebSocket(app: Express, httpServer: HTTPServer, storageInstance: IStorage) {
  const sessionMiddleware = app.get('sessionMiddleware') as RequestHandler;
  
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: "/ws",
    verifyClient: (info, callback) => {
      // Create a mock response object for session middleware
      const mockRes = {
        getHeader: () => null,
        setHeader: () => {},
        end: () => {}
      };
      
      // Parse session using Express session middleware
      sessionMiddleware(info.req as any, mockRes as any, (err?: any) => {
        if (err) {
          callback(false, 500, "Internal Server Error");
          return;
        }
        
        const session = (info.req as any).session;
        
        if (!session || !session.passport || !session.passport.user) {
          callback(false, 401, "Unauthorized");
          return;
        }
        
        callback(true);
      });
    }
  });

  const clients = new Map<string, WebSocketWithAuth>();
  const bookingSubscriptions = new Map<string, Set<WebSocketWithAuth>>();
  const userConnections = new Map<string, Set<WebSocketWithAuth>>();

  wss.on("connection", (ws: WebSocket, req: any) => {
    // Session was already verified in verifyClient
    const userId = req.session?.passport?.user;
    
    if (!userId) {
      ws.close(1008, "Unauthorized");
      return;
    }

    const clientId = Math.random().toString(36).substring(7);
    
    const wsAuth = ws as WebSocketWithAuth;
    wsAuth.id = clientId;
    wsAuth.userId = userId;
    
    clients.set(clientId, wsAuth);
    
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    userConnections.get(userId)!.add(wsAuth);
    
    log(`WebSocket client connected: ${clientId} (user: ${userId})`);
    
    wsAuth.send(JSON.stringify({ 
      type: "connected", 
      clientId,
      userId 
    }));

    wsAuth.on("message", async (data: Buffer) => {
      try {
        if (data.length > MAX_MESSAGE_SIZE) {
          wsAuth.send(JSON.stringify({ 
            type: "error", 
            message: "Message too large" 
          }));
          wsAuth.close(1009, "Message too large");
          return;
        }

        if (!checkRateLimit(clientId)) {
          wsAuth.send(JSON.stringify({ 
            type: "error", 
            message: "Rate limit exceeded" 
          }));
          return;
        }

        const message: WSMessage = JSON.parse(data.toString());

        if (!message.type || !["subscribe", "unsubscribe", ...Array.from(CALL_MESSAGE_TYPES)].includes(message.type)) {
          wsAuth.send(JSON.stringify({
            type: "error",
            message: "Invalid message type"
          }));
          return;
        }

        if (CALL_MESSAGE_TYPES.has(message.type)) {
          await handleCallSignal(wsAuth, message);
          return;
        }

        switch (message.type) {
          case "subscribe":
            if (!message.bookingId) {
              wsAuth.send(JSON.stringify({ 
                type: "error", 
                message: "Booking ID required" 
              }));
              return;
            }

            try {
              const booking = await storageInstance.getBooking(message.bookingId);
              
              if (!booking) {
                wsAuth.send(JSON.stringify({ 
                  type: "error", 
                  message: "Booking not found" 
                }));
                return;
              }

              // Check authorization: user must be the booking creator
              if (booking.userId !== wsAuth.userId) {
                // Or check if user is a driver assigned to this booking
                let isAuthorized = false;
                
                if (booking.driverId) {
                  try {
                    const driver = await storageInstance.getDriver(booking.driverId);
                    if (driver && driver.userId === wsAuth.userId) {
                      isAuthorized = true;
                    }
                  } catch (e) {
                    // Driver check failed, continue
                  }
                }
                
                if (!isAuthorized) {
                  wsAuth.send(JSON.stringify({ 
                    type: "error", 
                    message: "Not authorized to access this booking" 
                  }));
                  return;
                }
              }

              if (!bookingSubscriptions.has(message.bookingId)) {
                bookingSubscriptions.set(message.bookingId, new Set());
              }
              bookingSubscriptions.get(message.bookingId)!.add(wsAuth);
              
              log(`Client ${clientId} subscribed to booking ${message.bookingId}`);
              wsAuth.send(JSON.stringify({ 
                type: "subscribe_success", 
                bookingId: message.bookingId 
              }));
            } catch (error) {
              log(`Error subscribing to booking: ${error}`);
              wsAuth.send(JSON.stringify({ 
                type: "error", 
                message: "Failed to subscribe to booking" 
              }));
            }
            break;

          case "unsubscribe":
            if (message.bookingId) {
              const subscribers = bookingSubscriptions.get(message.bookingId);
              if (subscribers) {
                subscribers.delete(wsAuth);
                if (subscribers.size === 0) {
                  bookingSubscriptions.delete(message.bookingId);
                }
              }
              log(`Client ${clientId} unsubscribed from booking ${message.bookingId}`);
              wsAuth.send(JSON.stringify({ 
                type: "unsubscribe_success", 
                bookingId: message.bookingId 
              }));
            }
            break;
        }
      } catch (error) {
        log(`Error processing WebSocket message: ${error}`);
        wsAuth.send(JSON.stringify({ 
          type: "error", 
          message: "Invalid message format" 
        }));
      }
    });

    wsAuth.on("close", () => {
      log(`WebSocket client disconnected: ${clientId}`);
      clients.delete(clientId);
      
      const userConns = userConnections.get(wsAuth.userId);
      if (userConns) {
        userConns.delete(wsAuth);
        if (userConns.size === 0) {
          userConnections.delete(wsAuth.userId);
        }
      }
      
      bookingSubscriptions.forEach((subscribers, bookingId) => {
        subscribers.delete(wsAuth);
        if (subscribers.size === 0) {
          bookingSubscriptions.delete(bookingId);
        }
      });
      
      messageRates.delete(clientId);
    });

    wsAuth.on("error", (error) => {
      log(`WebSocket error for client ${clientId}: ${error}`);
    });
  });

  function broadcastToBooking(bookingId: string, message: any) {
    const subscribers = bookingSubscriptions.get(bookingId);
    if (subscribers) {
      const messageStr = JSON.stringify(message);
      subscribers.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
      log(`Broadcasted to ${subscribers.size} subscribers of booking ${bookingId}`);
    }
  }

  function broadcastToUser(userId: string, message: any) {
    const connections = userConnections.get(userId);
    if (connections) {
      const messageStr = JSON.stringify(message);
      connections.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
      log(`Broadcasted to ${connections.size} connections for user ${userId}`);
    }
  }

  async function handleCallSignal(sender: WebSocketWithAuth, message: WSMessage) {
    if (message.type === "call:invite") {
      if (!message.targetUserId || !message.callType) {
        sender.send(JSON.stringify({ type: "error", message: "targetUserId and callType are required" }));
        return;
      }
      const call = await storageInstance.createCall({
        bookingId: message.bookingId,
        callerId: sender.userId,
        calleeId: message.targetUserId,
        type: message.callType,
      });
      await storageInstance.createNotification({
        userId: message.targetUserId,
        title: message.callType === "video" ? "Incoming video call" : "Incoming voice call",
        message: "Tap to answer",
        type: "info",
        link: `/calls/${call.id}`,
      });
      broadcastToUser(message.targetUserId, {
        type: "call:invite",
        callId: call.id,
        fromUserId: sender.userId,
        callType: message.callType,
        bookingId: message.bookingId,
      });
      sender.send(JSON.stringify({ type: "call:invite_sent", callId: call.id }));
      return;
    }

    if (!message.callId || !message.targetUserId) {
      sender.send(JSON.stringify({ type: "error", message: "callId and targetUserId are required" }));
      return;
    }

    if (message.type === "call:answer") {
      await storageInstance.updateCallStatus(message.callId, "accepted");
    } else if (message.type === "call:reject") {
      await storageInstance.updateCallStatus(message.callId, "rejected");
    } else if (message.type === "call:end") {
      await storageInstance.updateCallStatus(message.callId, "completed");
    }

    broadcastToUser(message.targetUserId, {
      type: message.type,
      callId: message.callId,
      fromUserId: sender.userId,
      sdp: message.sdp,
      candidate: message.candidate,
    });
  }

  return {
    wss,
    broadcastToBooking,
    broadcastToUser,
  };
}
