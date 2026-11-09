import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();

// Health check route so you can easily verify Render is awake in your browser
app.get("/", (req, res) => {
  res.send("Signaling Server is live!");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("Peer connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    // Notify the other device in the room that a peer just joined/refreshed
    socket.to(roomId).emit("peer-joined", socket.id);
  });

  socket.on("offer", ({ roomId, offer }) => {
    console.log(`Relaying offer to room ${roomId}`);
    socket.to(roomId).emit("offer", offer);
  });

  socket.on("answer", ({ roomId, answer }) => {
    console.log(`Relaying answer to room ${roomId}`);
    socket.to(roomId).emit("answer", answer);
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", candidate);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Signaling server running on port ${PORT}`);
});
