import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Send, Smile } from "lucide-react";

interface ChatInputProps {
  onSend?: (message: string) => void;
  onAttach?: () => void;
}

export default function ChatInput({ onSend, onAttach }: ChatInputProps) {
  const [message, setMessage] = useState("");
  
  const handleSend = () => {
    if (message.trim()) {
      onSend?.(message);
      setMessage("");
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  return (
    <div className="border-t border-border bg-card p-4">
      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          onClick={() => {
            onAttach?.();
          }}
          data-testid="button-attach"
        >
          <Paperclip className="w-5 h-5" />
        </Button>
        
        <div className="flex-1 relative">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            className="pr-10 rounded-full"
            data-testid="input-message"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            data-testid="button-emoji"
          >
            <Smile className="w-4 h-4" />
          </Button>
        </div>
        
        <Button
          size="icon"
          className="flex-shrink-0 rounded-full bg-accent hover:bg-accent/90"
          onClick={handleSend}
          disabled={!message.trim()}
          data-testid="button-send"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
