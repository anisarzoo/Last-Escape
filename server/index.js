import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { MAZE_MAP, TILE_SIZE, MAZE_WIDTH, MAZE_HEIGHT } from './maze.js';


const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Game State
const players = {};
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, playerName }) => {
    socket.join(roomId);
    const spawnPoints = [
      { x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 }, // Top Left
      { x: MAZE_WIDTH - TILE_SIZE * 1.5, y: MAZE_HEIGHT - TILE_SIZE * 1.5 }, // Bottom Right (Opposite)
      { x: MAZE_WIDTH - TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 }, // Top Right
      { x: TILE_SIZE * 1.5, y: MAZE_HEIGHT - TILE_SIZE * 1.5 } // Bottom Left (Opposite)
    ];

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        players: [],
        treasure: { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT / 2, carrierId: null },
        zoneRadius: MAZE_WIDTH / 0.8,
        gameStarted: false,
        maze: MAZE_MAP,
        bullets: [],
        startTime: Date.now(),
        hostId: socket.id
      };
    }

    const playerIndex = rooms[roomId].players.length % 4;
    const startPos = spawnPoints[playerIndex];

    players[socket.id] = {
      id: socket.id,
      name: playerName,
      roomId,
      x: startPos.x,
      y: startPos.y,
      hp: 100,
      score: 0,
      range: 3,
      isCarryingTreasure: false,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      isHost: rooms[roomId].hostId === socket.id,
      lastShotTime: 0,
      aimAngle: 0
    };

    rooms[roomId].players.push(socket.id);
    io.to(roomId).emit('room-update', {
      ...rooms[roomId],
      players: rooms[roomId].players.map(id => players[id])
    });
    console.log(`${playerName} joined room ${roomId}`);
  });

  socket.on('start-game', () => {
    const player = players[socket.id];
    if (player && rooms[player.roomId] && rooms[player.roomId].hostId === socket.id) {
      rooms[player.roomId].gameStarted = true;
      rooms[player.roomId].startTime = Date.now();
      io.to(player.roomId).emit('game-started');
      startGameLoop(player.roomId);
    }
  });

  socket.on('player-move', (movement) => {
    const player = players[socket.id];
    const room = rooms[player?.roomId];
    if (player && room && room.gameStarted) {
      // Radius-based collision check
      const r = 15;
      const points = [
        { x: movement.x - r, y: movement.y - r },
        { x: movement.x + r, y: movement.y - r },
        { x: movement.x - r, y: movement.y + r },
        { x: movement.x + r, y: movement.y + r }
      ];

      let canMove = true;
      for (const p of points) {
        const tileX = Math.floor(p.x / TILE_SIZE);
        const tileY = Math.floor(p.y / TILE_SIZE);
        
        if (
          tileY >= 0 && tileY < MAZE_MAP.length &&
          tileX >= 0 && tileX < MAZE_MAP[0].length &&
          MAZE_MAP[tileY][tileX] === 1
        ) {
          canMove = false;
          break;
        }
      }
      
      if (canMove) {
        player.x = movement.x;
        player.y = movement.y;
      }
      
      // Always update aimAngle if provided
      if (movement.aimAngle !== undefined) {
        player.aimAngle = movement.aimAngle;
      }

      io.to(player.roomId).emit('player-moved', { 
        id: socket.id, 
        x: player.x, 
        y: player.y, 
        aimAngle: player.aimAngle 
      });
    }
  });

  socket.on('player-shoot', () => {
    const player = players[socket.id];
    const now = Date.now();
    if (player && player.hp > 0 && now - player.lastShotTime > 500) {
      const room = rooms[player.roomId];
      if (room && room.gameStarted) {
        player.lastShotTime = now;
        const bullet = {
          id: Math.random().toString(36).substr(2, 9),
          ownerId: socket.id,
          x: player.x,
          y: player.y,
          vx: Math.cos(player.aimAngle) * 15,
          vy: Math.sin(player.aimAngle) * 15,
          range: player.range * TILE_SIZE,
          distanceTraveled: 0
        };
        room.bullets.push(bullet);
      }
    }
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const room = rooms[player.roomId];
      if (room) {
        // Drop treasure if carrier disconnects
        if (room.treasure.carrierId === socket.id) {
          room.treasure.carrierId = null;
          room.treasure.x = player.x;
          room.treasure.y = player.y;
        }
        
        room.players = room.players.filter(id => id !== socket.id);
        if (room.players.length === 0) {
          delete rooms[player.roomId];
        } else {
          io.to(player.roomId).emit('room-update', {
            ...room,
            players: room.players.map(id => players[id])
          });
        }
      }
      delete players[socket.id];
    }
    console.log('User disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function startGameLoop(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const TICK_RATE = 30;
  const interval = setInterval(() => {
    if (!rooms[roomId]) {
      clearInterval(interval);
      return;
    }

    updateRoom(roomId);
    io.to(roomId).emit('game-state', {
      players: room.players.map(id => players[id]),
      bullets: room.bullets,
      treasure: room.treasure,
      zoneRadius: room.zoneRadius,
      time: Math.floor((Date.now() - room.startTime) / 1000)
    });
  }, 1000 / TICK_RATE);
}

function updateRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  // Shrink Zone
  const elapsed = (Date.now() - room.startTime) / 1000;
  const shrinkRate = 2; // pixels per second
  room.zoneRadius = Math.max(0, (MAZE_WIDTH / 0.8) - (elapsed * shrinkRate));

  // Update Bullets
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.distanceTraveled += Math.sqrt(b.vx**2 + b.vy**2);

    // Wall collision
    const tileX = Math.floor(b.x / TILE_SIZE);
    const tileY = Math.floor(b.y / TILE_SIZE);
    const isWall = MAZE_MAP[tileY] && MAZE_MAP[tileY][tileX] === 1;

    if (isWall || b.distanceTraveled > b.range) {
      room.bullets.splice(i, 1);
      continue;
    }

    // Player collision
    for (const pId of room.players) {
      if (pId === b.ownerId) continue;
      const p = players[pId];
      if (!p || p.hp <= 0) continue;

      const dist = Math.sqrt((b.x - p.x)**2 + (b.y - p.y)**2);
      if (dist < 20) {
        // Treasure carrier buff: takes less damage or has a shield
        const damage = p.isCarryingTreasure ? 15 : 20; 
        p.hp -= damage;
        room.bullets.splice(i, 1);

        if (p.hp <= 0) {
          // Elimination
          const killer = players[b.ownerId];
          if (killer) {
            killer.score += 1;
            killer.range = Math.min(8, killer.range + 1);
          }
          
          if (p.isCarryingTreasure) {
            p.isCarryingTreasure = false;
            room.treasure.carrierId = null;
            room.treasure.x = p.x;
            room.treasure.y = p.y;
          }
        }
        break;
      }
    }
  }

  // Treasure Pickup
  if (!room.treasure.carrierId) {
    for (const pId of room.players) {
      const p = players[pId];
      if (!p || p.hp <= 0) continue;

      const dist = Math.sqrt((p.x - room.treasure.x)**2 + (p.y - room.treasure.y)**2);
      if (dist < 30) {
        p.isCarryingTreasure = true;
        room.treasure.carrierId = pId;
        break;
      }
    }
  } else {
    const carrier = players[room.treasure.carrierId];
    if (carrier) {
      room.treasure.x = carrier.x;
      room.treasure.y = carrier.y;
      carrier.isCarryingTreasure = true;

      // Win Condition Check: Escape map through corners
      const tileX = Math.floor(carrier.x / TILE_SIZE);
      const tileY = Math.floor(carrier.y / TILE_SIZE);
      
      const isAtCorner = MAZE_MAP[tileY] && MAZE_MAP[tileY][tileX] === 2;
      const isOutside = carrier.x < 0 || carrier.x > MAZE_WIDTH || carrier.y < 0 || carrier.y > MAZE_HEIGHT;

      if (isAtCorner && isOutside) {
        io.to(roomId).emit('game-over', { winner: carrier.name });
        delete rooms[roomId];
      }
    } else {
      room.treasure.carrierId = null;
    }
  }

  // Zone Damage
  for (const pId of room.players) {
    const p = players[pId];
    if (!p || p.hp <= 0) continue;

    const distFromCenter = Math.sqrt((p.x - MAZE_WIDTH/2)**2 + (p.y - MAZE_HEIGHT/2)**2);
    if (distFromCenter > room.zoneRadius) {
      p.hp = 0; // Instant elimination
      if (p.isCarryingTreasure) {
        p.isCarryingTreasure = false;
        room.treasure.carrierId = null;
        room.treasure.x = p.x;
        room.treasure.y = p.y;
      }
    }
  }
}
