import { Check, CheckCheck, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  content: string;
  isSent: boolean;
  timestamp: string;
  status?: "sending" | "sent" | "delivered" | "read";
  isEncrypted?: boolean;
}

export default function MessageBubble({ 
  content, 
  isSent, 
  timestamp, 
  status = "read",
  isEncrypted = true 
}: MessageBubbleProps) {
  return (
    <div className={cn(
      "flex gap-2 mb-3 animate-in fade-in slide-in-from-bottom-2 duration-200",
      isSent ? "justify-end" : "justify-start"
    )}>
      {!isSent && (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-medium text-foreground">U</span>
        </div>
      )}
      
      <div className={cn(
        "max-w-[70%] rounded-2xl px-4 py-2.5 space-y-1",
        isSent 
          ? "bg-accent text-white rounded-tr-sm" 
          : "bg-card border border-card-border rounded-tl-sm"
      )}>
        <p className={cn(
          "text-sm leading-relaxed",
          isSent ? "text-white" : "text-foreground"
        )}>
          {content}
        </p>
        
        <div className="flex items-center gap-1.5 justify-end">
          {isEncrypted && (
            <Lock className={cn(
              "w-3 h-3",
              isSent ? "text-white/70" : "text-muted-foreground"
            )} />
          )}
          <span className={cn(
            "text-xs",
            isSent ? "text-white/70" : "text-muted-foreground"
          )}>
            {timestamp}
          </span>
          {isSent && (
            <span className="text-white/70">
              {status === "read" && <CheckCheck className="w-4 h-4" />}
              {status === "delivered" && <CheckCheck className="w-4 h-4 opacity-50" />}
              {status === "sent" && <Check className="w-4 h-4" />}
            </span>
          )}
        </div>
      </div>
      
      {isSent && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-medium text-white">M</span>
        </div>
      )}
    </div>
  );
}
