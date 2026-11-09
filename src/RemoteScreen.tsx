import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SIGNALING_SERVER = "http://192.168.1.6:4000";
const ROOM_ID = "remote-screen-room";

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function RemoteScreen() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<string>("Disconnected");

  useEffect(() => {
    socketRef.current = io(SIGNALING_SERVER);
    const socket = socketRef.current;

    const setupPeerConnection = () => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            roomId: ROOM_ID,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus("Streaming Remote Screen");
        }
      };

      pcRef.current = pc;
      return pc;
    };

    socket.on("connect", () => {
      setStatus("Connected to Signaling Server");
      setupPeerConnection();
      socket.emit("join-room", ROOM_ID);
    });

    socket.on("offer", async (offer: RTCSessionDescriptionInit) => {
      const pc = pcRef.current || setupPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { roomId: ROOM_ID, answer });
    });

    socket.on("answer", async (answer: RTCSessionDescriptionInit) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription(answer),
        );
      }
    });

    socket.on("ice-candidate", async (candidate: RTCIceCandidateInit) => {
      if (pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.disconnect();
      pcRef.current?.close();
    };
  }, []);

  // Optional: If you want to share Desktop Screen -> Android instead
  const shareDesktopScreen = async () => {
    if (!pcRef.current || !socketRef.current) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    stream
      .getTracks()
      .forEach((track) => pcRef.current!.addTrack(track, stream));

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    socketRef.current.emit("offer", { roomId: ROOM_ID, offer });
    setStatus("Sharing Desktop Screen...");
  };

  return (
    <div
      style={{
        padding: 24,
        fontFamily: "sans-serif",
        background: "#121212",
        color: "#fff",
        minHeight: "100vh",
      }}
    >
      <h2>Remote Screen Console ({status})</h2>
      <button
        onClick={shareDesktopScreen}
        style={{ padding: "10px 16px", marginBottom: 16, cursor: "pointer" }}
      >
        Broadcast Desktop to Android
      </button>
      <div
        style={{
          border: "1px solid #333",
          borderRadius: 8,
          overflow: "hidden",
          maxWidth: 960,
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls
          style={{ width: "100%", display: "block", background: "#000" }}
        />
      </div>
    </div>
  );
}
