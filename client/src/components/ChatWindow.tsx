import { Lock, MoreVertical, Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { useState } from "react";

//todo: remove mock functionality
const mockMessages = [
  { id: 1, content: "Hey! Testing the encrypted chat", isSent: false, timestamp: "10:23 AM" },
  { id: 2, content: "Everything looks secure! All messages are E2E encrypted.", isSent: true, timestamp: "10:24 AM", status: "read" as const },
  { id: 3, content: "That's great! How does the sealed-sender work?", isSent: false, timestamp: "10:25 AM" },
  { id: 4, content: "The server only sees the routing tag, not the sender identity. Complete privacy!", isSent: true, timestamp: "10:25 AM", status: "delivered" as const },
];

export default function ChatWindow() {
  const [messages, setMessages] = useState(mockMessages);
  
  const handleSend = (content: string) => {
    const newMessage = {
      id: messages.length + 1,
      content,
      isSent: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "delivered" as const
    };
    setMessages([...messages, newMessage]);
  };
  
  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <span className="text-sm font-medium">JD</span>
          </div>
          <div>
            <h2 className="font-semibold text-foreground">John Doe</h2>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="w-3 h-3 text-green-500" />
              <span>End-to-end encrypted</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" data-testid="button-voice-call">
            <Phone className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" data-testid="button-video-call">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" data-testid="button-more">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} {...msg} />
        ))}
      </div>
      
      <ChatInput onSend={handleSend} />
    </div>
  );
}
