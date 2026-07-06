import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, Loader2, Languages, Phone, Video } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { Message } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCall } from "@/lib/CallProvider";

interface BookingChatProps {
  bookingId: string;
  otherUserId?: string;
}

interface MessageTranslation {
  translatedContent: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export default function BookingChat({ bookingId, otherUserId }: BookingChatProps) {
  const [message, setMessage] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const { startCall } = useCall();

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/bookings", bookingId, "messages"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/messages", {
        bookingId,
        content,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "messages"] });
      setMessage("");
    },
    onError: () => {
      toast({
        title: "Failed to send message",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!bookingId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const websocket = new WebSocket(wsUrl);
      
      websocket.onopen = () => {
        websocket.send(JSON.stringify({ 
          type: "subscribe", 
          bookingId 
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "message" && data.bookingId === bookingId) {
            queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "messages"] });
          }
        } catch {
          toast({
            title: "Message sync failed",
            description: "Reconnecting...",
            variant: "destructive",
          });
        }
      };

      websocket.onerror = () => {
        toast({
          title: "Connection lost",
          description: "Attempting to reconnect...",
          variant: "destructive",
        });
      };

      websocket.onclose = () => {
        setTimeout(() => {
          if (bookingId) {
            window.location.reload();
          }
        }, 3000);
      };

      setWs(websocket);

      return () => {
        websocket.close();
      };
    } catch {
      toast({
        title: "Chat unavailable",
        description: "Please refresh the page",
        variant: "destructive",
      });
    }
  }, [bookingId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
  };

  const handleTranslate = async (msg: Message) => {
    if (translations[msg.id]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
      return;
    }
    setTranslatingId(msg.id);
    try {
      const res = await apiRequest("POST", `/api/messages/${msg.id}/translate`, {
        targetLanguage: i18n.language.split("-")[0],
      });
      const data = await res.json();
      setTranslations((prev) => ({
        ...prev,
        [msg.id]: {
          translatedContent: data.translatedContent,
          sourceLanguage: data.sourceLanguage,
          targetLanguage: data.targetLanguage,
        },
      }));
    } catch (error: any) {
      toast({ title: "Translation failed", description: error.message, variant: "destructive" });
    } finally {
      setTranslatingId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Chat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="border-b flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Chat
        </CardTitle>
        {otherUserId && (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startCall(otherUserId, "voice", bookingId)}
              data-testid="button-voice-call"
            >
              <Phone className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startCall(otherUserId, "video", bookingId)}
              data-testid="button-video-call"
            >
              <Video className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No messages yet. Start the conversation!
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.senderId === user?.id;
                
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""}`}
                    data-testid={`message-${msg.id}`}
                  >
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className={isOwnMessage ? "bg-accent/20 text-accent" : "bg-secondary"}>
                        {isOwnMessage ? "You" : "Them"}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex-1 ${isOwnMessage ? "text-right" : ""}`}>
                      <div
                        className={`inline-block p-3 rounded-lg max-w-[80%] ${
                          isOwnMessage
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <p className="text-sm break-words">{msg.content}</p>
                        {translations[msg.id] && (
                          <p className="text-sm break-words mt-2 pt-2 border-t border-current/20 italic">
                            {translations[msg.id].translatedContent}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 justify-end">
                        {!isOwnMessage && (
                          <button
                            type="button"
                            onClick={() => handleTranslate(msg)}
                            disabled={translatingId === msg.id}
                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                            data-testid={`button-translate-${msg.id}`}
                          >
                            {translatingId === msg.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Languages className="w-3 h-3" />
                            )}
                            {translations[msg.id] ? "Hide translation" : "Translate"}
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(msg.createdAt), "p")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <form onSubmit={handleSend} className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sendMessageMutation.isPending}
              data-testid="input-message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sendMessageMutation.isPending || !message.trim()}
              data-testid="button-send-message"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
