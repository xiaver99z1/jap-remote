import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const ROOM_ID = "remote-screen-room";

// Map of socket.id -> { socketId, deviceName, networkType, isCapturing }
const connectedPhones = new Map();

app.get("/", (req, res) => {
  res.send("Signaling Server is live!");
});

io.on("connection", (socket) => {
  console.log("Peer connected:", socket.id);

  socket.on("join-room", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId || ROOM_ID;
    const role = typeof payload === "object" ? payload?.role : "unknown";

    socket.join(roomId);
    console.log(`Socket ${socket.id} (${role}) joined room ${roomId}`);

    if (role === "phone") {
      connectedPhones.set(socket.id, {
        socketId: socket.id,
        deviceName: payload.deviceName || `Phone (${socket.id.slice(0, 4)})`,
        networkType: payload.networkType || "unknown",
        isCapturing: !!payload.isCapturing,
      });
    }

    // Broadcast updated phone list to all desktop viewers in the room
    io.to(roomId).emit("devices-list", Array.from(connectedPhones.values()));
  });

  // Phone reports a change in Wi-Fi / Mobile Data or screen capture state
  socket.on("device-status", ({ roomId = ROOM_ID, deviceName, networkType, isCapturing }) => {
    const existing = connectedPhones.get(socket.id) || { socketId: socket.id };
    connectedPhones.set(socket.id, {
      ...existing,
      deviceName: deviceName || existing.deviceName || `Phone (${socket.id.slice(0, 4)})`,
      networkType: networkType || existing.networkType || "unknown",
      isCapturing: isCapturing !== undefined ? isCapturing : existing.isCapturing,
    });

    io.to(roomId).emit("devices-list", Array.from(connectedPhones.values()));
  });

  // Desktop viewer requests a specific phone to start streaming
  socket.on("request-stream", ({ targetSocketId, allowCellular }) => {
    console.log(`Desktop ${socket.id} requested stream from ${targetSocketId} (allowCellular: ${!!allowCellular})`);
    io.to(targetSocketId).emit("request-stream", {
      viewerSocketId: socket.id,
      allowCellular: !!allowCellular,
    });
  });

  // Desktop viewer tells a phone to pause its WebRTC stream (e.g., when switching phones)
  socket.on("stop-stream", ({ targetSocketId }) => {
    io.to(targetSocketId).emit("stop-stream", { viewerSocketId: socket.id });
  });

  // Targeted WebRTC signaling (supports multiple phones cleanly without collisions)
  socket.on("offer", ({ roomId = ROOM_ID, targetSocketId, offer }) => {
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", { fromSocketId: socket.id, offer });
    } else {
      socket.to(roomId).emit("offer", { fromSocketId: socket.id, offer });
    }
  });

  socket.on("answer", ({ roomId = ROOM_ID, targetSocketId, answer }) => {
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", { fromSocketId: socket.id, answer });
    } else {
      socket.to(roomId).emit("answer", { fromSocketId: socket.id, answer });
    }
  });

  socket.on("ice-candidate", ({ roomId = ROOM_ID, targetSocketId, candidate }) => {
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", { fromSocketId: socket.id, candidate });
    } else {
      socket.to(roomId).emit("ice-candidate", { fromSocketId: socket.id, candidate });
    }
  });

  socket.on("disconnect", () => {
    console.log("Peer disconnected:", socket.id);
    if (connectedPhones.has(socket.id)) {
      connectedPhones.delete(socket.id);
      io.to(ROOM_ID).emit("devices-list", Array.from(connectedPhones.values()));
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Signaling Server running on port ${PORT}`);
});