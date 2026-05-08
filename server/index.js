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

// Helper to move player safely (collision aware)
function moveSafely(p, dx, dy) {
  const r = 14;
  let newX = p.x + dx;
  let newY = p.y + dy;

  const checkWall = (tx, ty) => {
    const pts = [
      { x: tx - r, y: ty - r },
      { x: tx + r, y: ty - r },
      { x: tx - r, y: ty + r },
      { x: tx + r, y: ty + r }
    ];
    for (const pt of pts) {
      const tileX = Math.floor(pt.x / TILE_SIZE);
      const tileY = Math.floor(pt.y / TILE_SIZE);
      if (MAZE_MAP[tileY] && MAZE_MAP[tileY][tileX] === 1) return true;
    }
    return false;
  };

  // Try X
  if (!checkWall(newX, p.y)) p.x = newX;
  // Try Y
  if (!checkWall(p.x, newY)) p.y = newY;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, playerName, create }) => {
    // 1. Validation
    if (!rooms[roomId] && !create) {
      socket.emit('error', { message: 'Invalid Room Code' });
      return;
    }

    if (rooms[roomId]) {
      if (rooms[roomId].gameStarted) {
        socket.emit('error', { message: 'Game already in progress' });
        return;
      }
      if (rooms[roomId].players.length >= 8) {
        socket.emit('error', { message: 'Room is full (Max 8 players)' });
        return;
      }
    }

    socket.join(roomId);
    
    // Players spawn exactly at the 8 Exit locations
    const spawnPoints = [
      { x: TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 },   // Top-Left
      { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 },  // Top-Right
      { x: TILE_SIZE * 0.5, y: MAZE_HEIGHT - TILE_SIZE * 0.5 }, // Bottom-Left
      { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: MAZE_HEIGHT - TILE_SIZE * 0.5 }, // Bottom-Right
      { x: MAZE_WIDTH / 2, y: TILE_SIZE * 0.5 },   // Top-Mid
      { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT - TILE_SIZE * 0.5 }, // Bottom-Mid
      { x: TILE_SIZE * 0.5, y: MAZE_HEIGHT / 2 },  // Left-Mid
      { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: MAZE_HEIGHT / 2 }  // Right-Mid
    ];

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        players: [],
        bullets: [],
        maze: JSON.parse(JSON.stringify(MAZE_MAP)), // Deep copy for room-specific destruction
        weakWallsHP: {}, // Track HP of type 3 tiles
        gameStarted: false,
        hostId: socket.id,
        key: { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT / 2, carrierId: null },
        zoneRadius: Math.sqrt((MAZE_WIDTH / 2) ** 2 + (MAZE_HEIGHT / 2) ** 2) + 200, // Cover all corners + margin
        zoneRemoved: false,
        startTime: null,
        status: 'waiting'
      };
    }

    const playerIndex = rooms[roomId].players.length % 8;
    const startPos = spawnPoints[playerIndex];

    players[socket.id] = {
      id: socket.id,
      name: playerName,
      roomId,
      x: startPos.x,
      y: startPos.y,
      hp: 100,
      score: 0,
      range: 5,
      isCarryingKey: false,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      isHost: rooms[roomId].hostId === socket.id,
      lastShotTime: 0,
      aimAngle: 0,
      totalKeyHoldTime: 0,
      lastDashTime: 0,
      isDashing: false
    };

    rooms[roomId].players.push(socket.id);
    io.to(roomId).emit('room-update', {
      ...rooms[roomId],
      players: rooms[roomId].players.map(id => players[id]).filter(Boolean)
    });
    console.log(`${playerName} joined room ${roomId}`);
  });

  socket.on('start-game', () => {
    const player = players[socket.id];
    if (player && rooms[player.roomId] && rooms[player.roomId].hostId === socket.id) {
      rooms[player.roomId].gameStarted = true;
      rooms[player.roomId].startTime = Date.now();
      rooms[player.roomId].keyHoldTime = 0;
      rooms[player.roomId].lastKeyUpdate = null;
      io.to(player.roomId).emit('game-started');
      startGameLoop(player.roomId);
    }
  });

  socket.on('player-move', (movement) => {
    const player = players[socket.id];
    const room = rooms[player?.roomId];
    if (player && room && room.gameStarted) {
      // Radius-based collision check
      const r = 14;
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
          tileY >= 0 && tileY < room.maze.length &&
          tileX >= 0 && tileX < room.maze[0].length &&
          (room.maze[tileY][tileX] === 1 || room.maze[tileY][tileX] === 3)
        ) {
          canMove = false;
          break;
        }
      }
      
      const oldX = player.x;
      const oldY = player.y;

      if (canMove) {
        player.x = movement.x;
        player.y = movement.y;
      }
      
      // Dash Collision Check
      if (player.isDashing) {
        const dashDx = player.x - oldX;
        const dashDy = player.y - oldY;
        const dashAngle = Math.atan2(dashDy, dashDx);

        for (const pId of room.players) {
          if (pId === socket.id) continue;
          const target = players[pId];
          if (!target || target.hp <= 0) continue;

          const dist = Math.sqrt((player.x - target.x)**2 + (player.y - target.y)**2);
          if (dist < 40) { // Collision radius
            target.hp -= 10;
            
            // Pure velocity impulse (High force for smooth but strong push)
            const kbForce = 45; 
            const kx = Math.cos(dashAngle) * kbForce;
            const ky = Math.sin(dashAngle) * kbForce;
            
            io.to(player.roomId).emit('player-knockback', { id: pId, vx: kx, vy: ky });
            io.to(player.roomId).emit('play-sound', { x: target.x, y: target.y, type: 'dash-hit' });
            
            // Don't stop dash on hit for better flow
            break;
          }
        }
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

  socket.on('player-dash', () => {
    const player = players[socket.id];
    if (player && Date.now() - player.lastDashTime > 3000) {
      player.lastDashTime = Date.now();
      player.isDashing = true;
      setTimeout(() => {
        if (players[socket.id]) players[socket.id].isDashing = false;
      }, 300);
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
          distanceTraveled: 0,
          bounces: 2
        };
        room.bullets.push(bullet);
        io.to(player.roomId).emit('play-sound', { x: player.x, y: player.y, type: 'shoot' });
      }
    }
  });

  socket.on('play-sound', (data) => {
    const player = players[socket.id];
    if (player) {
      io.to(player.roomId).emit('play-sound', data);
    }
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const room = rooms[player.roomId];
      if (room) {
        // Drop key if carrier disconnects
        if (room.key.carrierId === socket.id) {
          room.key.carrierId = null;
          room.key.x = player.x;
          room.key.y = player.y;
          room.keyHoldTime = 0;
          room.lastKeyUpdate = null;
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
      players: room.players.map(id => {
        const p = players[id];
        return { 
          id: p.id, x: p.x, y: p.y, hp: p.hp, 
          aimAngle: p.aimAngle, isCarryingKey: p.isCarryingKey, 
          score: p.score, name: p.name, color: p.color,
          range: p.range
        };
      }),
      bullets: room.bullets.map(b => ({ 
        id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, bounces: b.bounces 
      })),
      key: room.key,
      keyHoldTime: room.keyHoldTime || 0,
      zoneRadius: room.zoneRadius,
      maze: room.maze, // Send dynamic maze state
      time: Math.floor((Date.now() - room.startTime) / 1000)
    });
  }, 1000 / TICK_RATE);
}

function updateRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  // Shrink Zone (only if no one has key)
  if (!room.key.carrierId && !room.zoneRemoved) {
    const shrinkPerTick = 0.1;
    room.zoneRadius = Math.max(0, room.zoneRadius - shrinkPerTick);
  } else if (!room.zoneRemoved) {
    room.zoneRemoved = true;
    room.zoneRadius = 99999;
    io.to(roomId).emit('play-sound', { x: MAZE_WIDTH/2, y: MAZE_HEIGHT/2, type: 'zone-removed' });
  }

  // Update Bullets
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    const nextX = b.x + b.vx;
    const nextY = b.y + b.vy;
    const nextTileX = Math.floor(nextX / TILE_SIZE);
    const nextTileY = Math.floor(nextY / TILE_SIZE);

    const isWall = room.maze[nextTileY] && room.maze[nextTileY][nextTileX] === 1;
    const isWeakWall = room.maze[nextTileY] && room.maze[nextTileY][nextTileX] === 3;

    if (isWall || isWeakWall) {
      if (isWeakWall) {
        const wallKey = `${nextTileY},${nextTileX}`;
        if (!room.weakWallsHP[wallKey]) room.weakWallsHP[wallKey] = 100;
        room.weakWallsHP[wallKey] -= 25; // 4 shots to break
        
        if (room.weakWallsHP[wallKey] <= 0) {
          room.maze[nextTileY][nextTileX] = 0;
          io.to(roomId).emit('play-sound', { x: nextX, y: nextY, type: 'wall-break' });
        }
        room.bullets.splice(i, 1);
        continue;
      }

      if (b.bounces > 0) {
        let bounced = false;
        const currentTileX = Math.floor(b.x / TILE_SIZE);
        const currentTileY = Math.floor(b.y / TILE_SIZE);

        if (room.maze[currentTileY] && room.maze[currentTileY][nextTileX] === 1) {
          b.vx *= -1;
          bounced = true;
        }
        if (room.maze[nextTileY] && room.maze[nextTileY][currentTileX] === 1) {
          b.vy *= -1;
          bounced = true;
        }
        
        if (!bounced) { b.vx *= -1; b.vy *= -1; }
        
        b.bounces--;
        io.to(roomId).emit('play-sound', { x: b.x, y: b.y, type: 'ricochet' });
      } else {
        room.bullets.splice(i, 1);
        continue;
      }
    } else {
      b.x = nextX;
      b.y = nextY;
      b.distanceTraveled += Math.sqrt(b.vx**2 + b.vy**2);
    }

    if (b.distanceTraveled > b.range) {
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
        // Key carrier buff: takes less damage or has a shield
        const wasCarrier = p.isCarryingKey;
        const damage = wasCarrier ? 15 : 20; 
        p.hp -= damage;
        
        // Apply Knockback (Pure Velocity)
        const kbForce = 10;
        const angle = Math.atan2(b.vy, b.vx);
        const kx = Math.cos(angle) * kbForce;
        const ky = Math.sin(angle) * kbForce;
        
        io.to(roomId).emit('player-knockback', { id: pId, vx: kx, vy: ky });

        room.bullets.splice(i, 1);
        io.to(roomId).emit('play-sound', { x: p.x, y: p.y, type: 'hit' });

        if (p.hp <= 0) {
          // Elimination
          const killer = players[b.ownerId];
          if (killer) {
            killer.score += 1;
            killer.range = Math.min(8, killer.range + 1);
            p.killedBy = killer.id;
            
            // Hunter Reward: If you kill the key carrier, get +50 HP
            if (wasCarrier) {
              killer.hp = Math.min(100, killer.hp + 50);
            }
          } else {
            p.killedBy = 'ZONE';
          }
          
          if (wasCarrier) {
            p.isCarryingKey = false;
            room.key.carrierId = null;
            room.key.x = p.x;
            room.key.y = p.y;
            room.keyHoldTime = 0;
            room.lastKeyUpdate = null;
          }
        }
        break;
      }
    }
  }

  // Key Pickup & Handling
  const now = Date.now();
  if (!room.key.carrierId) {
    room.keyHoldTime = 0;
    room.lastKeyUpdate = null;

    for (const pId of room.players) {
      const p = players[pId];
      if (!p || p.hp <= 0) continue;

      const dist = Math.sqrt((p.x - room.key.x)**2 + (p.y - room.key.y)**2);
      if (dist < 30) {
        p.isCarryingKey = true;
        room.key.carrierId = pId;
        room.lastKeyUpdate = now;
        io.to(roomId).emit('play-sound', { x: p.x, y: p.y, type: 'pickup' });
        break;
      }
    }
  } else {
    const carrier = players[room.key.carrierId];
    if (carrier && carrier.hp > 0) {
      room.key.x = carrier.x;
      room.key.y = carrier.y;
      carrier.isCarryingKey = true;

      // Update Hold Time
      if (room.lastKeyUpdate) {
        const delta = (now - room.lastKeyUpdate) / 1000;
        room.keyHoldTime += delta;
        carrier.totalKeyHoldTime += delta;
        room.lastKeyUpdate = now;

        // Apply Scaling Health Drain to all OTHER players
        const drainRate = room.keyHoldTime < 60 ? 0.5 : 1.0;
        const drainAmount = drainRate * delta;

        for (const pId of room.players) {
          if (pId === room.key.carrierId) continue;
          const p = players[pId];
          if (p && p.hp > 0) {
            p.hp -= drainAmount;
            if (p.hp <= 0) {
              p.hp = 0;
              p.killedBy = room.key.carrierId; // Technically killed by the pressure of the carrier
            }
          }
        }
      }

      // Win Condition Check: Escape map through corners or reach EXIT tile
      const tileX = Math.floor(carrier.x / TILE_SIZE);
      const tileY = Math.floor(carrier.y / TILE_SIZE);
      const onExitTile = MAZE_MAP[tileY] && MAZE_MAP[tileY][tileX] === 2;
      const isOutside = carrier.x < -20 || carrier.x > MAZE_WIDTH + 20 || carrier.y < -20 || carrier.y > MAZE_HEIGHT + 20;

      if (onExitTile || isOutside) {
        io.to(roomId).emit('game-over', { 
          winner: carrier.name,
          stats: room.players.map(id => ({
            name: players[id].name,
            score: players[id].score,
            holdTime: Math.floor(players[id].totalKeyHoldTime || 0),
            isWinner: id === room.key.carrierId
          }))
        });
        delete rooms[roomId];
        return;
      }
    } else {
      room.key.carrierId = null;
      room.keyHoldTime = 0;
      room.lastKeyUpdate = null;
    }
  }

      // Zone Damage (Legacy, only applies if outside zone)
  for (const pId of room.players) {
    const p = players[pId];
    if (!p || p.hp <= 0) continue;

    const distFromCenter = Math.sqrt((p.x - MAZE_WIDTH/2)**2 + (p.y - MAZE_HEIGHT/2)**2);
    if (distFromCenter > room.zoneRadius) {
      p.hp -= 0.5; // Steady drain instead of instant kill
      if (p.hp <= 0) {
        p.killedBy = 'ZONE';
      }
      if (p.isCarryingKey) {
        p.isCarryingKey = false;
        room.key.carrierId = null;
        room.key.x = p.x;
        room.key.y = p.y;
        room.keyHoldTime = 0;
        room.lastKeyUpdate = null;
      }
    }
  }
}
