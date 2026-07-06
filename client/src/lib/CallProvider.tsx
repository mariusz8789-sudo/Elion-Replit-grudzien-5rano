import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { apiRequest } from "./queryClient";
import CallModal from "@/components/CallModal";

type CallType = "voice" | "video";
type CallPhase = "idle" | "outgoing-ringing" | "incoming-ringing" | "connecting" | "connected" | "ended" | "unsupported";

interface CallState {
  phase: CallPhase;
  callId: string | null;
  otherUserId: string | null;
  callType: CallType;
  bookingId?: string;
  quality: "good" | "fair" | "poor" | "unknown";
}

interface CallContextValue extends CallState {
  startCall: (otherUserId: string, callType: CallType, bookingId?: string) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

const initialState: CallState = {
  phase: "idle",
  callId: null,
  otherUserId: null,
  callType: "voice",
  quality: "unknown",
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<CallState>(initialState);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const qualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;

  // Stable identity ([]) is required here: this is a dependency of the persistent signaling
  // socket effect below, and previously depended on `localStream` (read via closure), which
  // changes every time a call starts/ends — tearing down and recreating the signaling socket
  // on every single call and breaking the separate invite_sent listener bound to the old one.
  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const startQualityMonitor = useCallback((callId: string) => {
    if (qualityIntervalRef.current) clearInterval(qualityIntervalRef.current);
    const samples: number[] = [];
    qualityIntervalRef.current = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      const stats = await pc.getStats();
      let packetsLost = 0;
      let packetsReceived = 0;
      stats.forEach((report) => {
        if (report.type === "inbound-rtp") {
          packetsLost += report.packetsLost ?? 0;
          packetsReceived += report.packetsReceived ?? 0;
        }
      });
      const lossRatio = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;
      samples.push(lossRatio);
      const quality = lossRatio < 0.02 ? "good" : lossRatio < 0.08 ? "fair" : "poor";
      setState((prev) => (prev.callId === callId ? { ...prev, quality } : prev));
    }, 4000);
  }, []);

  const createPeerConnection = useCallback(
    async (callId: string, callType: CallType, otherUserId: string) => {
      const iceRes = await apiRequest("GET", "/api/webrtc/ice-config");
      const { iceServers } = await iceRes.json();

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      setLocalStream(stream);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: "call:ice-candidate", callId, targetUserId: otherUserId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setState((prev) => (prev.callId === callId ? { ...prev, phase: "connected" } : prev));
          startQualityMonitor(callId);
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setState((prev) => (prev.callId === callId ? { ...prev, phase: "ended" } : prev));
        }
      };

      return pc;
    },
    [send, startQualityMonitor],
  );

  const startCall = useCallback(
    async (otherUserId: string, callType: CallType, bookingId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        setState({ ...initialState, phase: "unsupported" });
        return;
      }
      setState({ phase: "outgoing-ringing", callId: null, otherUserId, callType, bookingId, quality: "unknown" });
      send({ type: "call:invite", targetUserId: otherUserId, callType, bookingId });
    },
    [send],
  );

  const acceptCall = useCallback(async () => {
    const current = stateRef.current;
    if (!current.callId || !current.otherUserId) return;
    setState((prev) => ({ ...prev, phase: "connecting" }));
    const pc = await createPeerConnection(current.callId, current.callType, current.otherUserId);

    const offer = (pc as any)._pendingOffer as RTCSessionDescriptionInit | undefined;
    if (offer) {
      await pc.setRemoteDescription(offer);
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
      pendingCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "call:answer", callId: current.callId, targetUserId: current.otherUserId, sdp: answer });
    }
  }, [createPeerConnection, send]);

  const rejectCall = useCallback(() => {
    const current = stateRef.current;
    if (current.callId && current.otherUserId) {
      send({ type: "call:reject", callId: current.callId, targetUserId: current.otherUserId });
    }
    cleanupMedia();
    setState(initialState);
  }, [send, cleanupMedia]);

  const endCall = useCallback(() => {
    const current = stateRef.current;
    if (current.callId && current.otherUserId) {
      send({ type: "call:end", callId: current.callId, targetUserId: current.otherUserId });
    }
    cleanupMedia();
    setState(initialState);
  }, [send, cleanupMedia]);

  // Persistent signaling connection, independent of any single chat/page.
  useEffect(() => {
    if (!user?.id) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = socket;

    socket.onmessage = async (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (data.type) {
        case "call:invite_sent":
          setState((prev) => (prev.phase === "outgoing-ringing" && !prev.callId ? { ...prev, callId: data.callId } : prev));
          break;

        case "call:invite":
          setState({
            phase: "incoming-ringing",
            callId: data.callId,
            otherUserId: data.fromUserId,
            callType: data.callType,
            bookingId: data.bookingId,
            quality: "unknown",
          });
          break;

        case "call:offer": {
          const current = stateRef.current;
          if (current.callId !== data.callId) return;
          if (!pcRef.current) {
            // Stash the offer; applied once the user accepts and media is ready.
            const placeholder = {} as RTCPeerConnection;
            (placeholder as any)._pendingOffer = data.sdp;
            pcRef.current = placeholder;
          } else {
            (pcRef.current as any)._pendingOffer = data.sdp;
          }
          break;
        }

        case "call:answer": {
          const pc = pcRef.current;
          if (pc && pc.setRemoteDescription) {
            await pc.setRemoteDescription(data.sdp);
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(candidate).catch(() => undefined);
            }
            pendingCandidatesRef.current = [];
          }
          break;
        }

        case "call:ice-candidate": {
          const pc = pcRef.current;
          if (pc?.remoteDescription) {
            await pc.addIceCandidate(data.candidate).catch(() => undefined);
          } else {
            pendingCandidatesRef.current.push(data.candidate);
          }
          break;
        }

        case "call:reject":
        case "call:end":
          cleanupMedia();
          setState(initialState);
          break;
      }
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [user?.id, cleanupMedia]);

  // Once we've sent an invite, wait for the callee to answer (call:invite_sent -> we already
  // have a callId from the server before offer creation happens on the caller side).
  useEffect(() => {
    if (state.phase !== "outgoing-ringing" || !state.callId) return;
    (async () => {
      const pc = await createPeerConnection(state.callId!, state.callType, state.otherUserId!);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "call:offer", callId: state.callId, targetUserId: state.otherUserId, sdp: offer });
      setState((prev) => (prev.callId === state.callId ? { ...prev, phase: "connecting" } : prev));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.callId]);

  return (
    <CallContext.Provider value={{ ...state, startCall, acceptCall, rejectCall, endCall, localStream, remoteStream }}>
      {children}
      {state.phase !== "idle" && (
        <CallModal
          phase={state.phase}
          callType={state.callType}
          localStream={localStream}
          remoteStream={remoteStream}
          quality={state.quality}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          onDismissUnsupported={() => setState(initialState)}
        />
      )}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}
