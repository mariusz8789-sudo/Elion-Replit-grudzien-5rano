import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Video, Signal, SignalLow, SignalMedium } from "lucide-react";

interface CallModalProps {
  phase: "outgoing-ringing" | "incoming-ringing" | "connecting" | "connected" | "ended" | "unsupported";
  callType: "voice" | "video";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  quality: "good" | "fair" | "poor" | "unknown";
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onDismissUnsupported: () => void;
}

function QualityIndicator({ quality }: { quality: CallModalProps["quality"] }) {
  if (quality === "unknown") return null;
  const Icon = quality === "good" ? Signal : quality === "fair" ? SignalMedium : SignalLow;
  const color = quality === "good" ? "text-green-500" : quality === "fair" ? "text-yellow-500" : "text-red-500";
  return (
    <div className={`flex items-center gap-1 text-xs ${color}`} data-testid="call-quality-indicator">
      <Icon className="w-4 h-4" />
      {quality}
    </div>
  );
}

export default function CallModal({
  phase,
  callType,
  localStream,
  remoteStream,
  quality,
  onAccept,
  onReject,
  onEnd,
  onDismissUnsupported,
}: CallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (callType === "video" && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (callType === "voice" && remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callType]);

  if (phase === "unsupported") {
    return (
      <Dialog open onOpenChange={onDismissUnsupported}>
        <DialogContent data-testid="dialog-call-unsupported">
          <DialogHeader>
            <DialogTitle>Calls not supported</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your browser or device does not support voice/video calling. Please use the in-app chat instead, or try
            a modern browser (Chrome, Firefox, Safari, Edge) with camera/microphone access.
          </p>
          <Button onClick={onDismissUnsupported}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && (phase === "connected" ? onEnd() : onReject())}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-call">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              {phase === "outgoing-ringing" && "Calling..."}
              {phase === "incoming-ringing" && `Incoming ${callType} call`}
              {phase === "connecting" && "Connecting..."}
              {phase === "connected" && `${callType === "video" ? "Video" : "Voice"} call`}
              {phase === "ended" && "Call ended"}
            </span>
            <QualityIndicator quality={quality} />
          </DialogTitle>
        </DialogHeader>

        {callType === "video" ? (
          <div className="grid grid-cols-2 gap-2">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full aspect-video bg-black rounded-md" />
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full aspect-video bg-black rounded-md" />
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="w-8 h-8 text-primary" />
            </div>
            <audio ref={remoteAudioRef} autoPlay />
          </div>
        )}

        <div className="flex items-center justify-center gap-4 mt-4">
          {phase === "incoming-ringing" && (
            <>
              <Button variant="destructive" size="icon" className="rounded-full h-12 w-12" onClick={onReject} data-testid="button-reject-call">
                <PhoneOff className="w-5 h-5" />
              </Button>
              <Button size="icon" className="rounded-full h-12 w-12 bg-green-600 hover:bg-green-700" onClick={onAccept} data-testid="button-accept-call">
                {callType === "video" ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
              </Button>
            </>
          )}
          {(phase === "outgoing-ringing" || phase === "connecting" || phase === "connected") && (
            <Button variant="destructive" size="icon" className="rounded-full h-12 w-12" onClick={onEnd} data-testid="button-end-call">
              <PhoneOff className="w-5 h-5" />
            </Button>
          )}
          {phase === "ended" && (
            <Button variant="outline" onClick={onEnd} data-testid="button-close-ended-call">
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
