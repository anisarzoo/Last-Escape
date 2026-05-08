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

  socket.on('join-room', ({ roomId, playerName }) => {
    socket.join(roomId);
    
    // Spawn points at absolute corners
    const spawnPoints = [
      { x: TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 }, // Top Left (0,0)
      { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: MAZE_HEIGHT - TILE_SIZE * 0.5 }, // Bottom Right (30,30)
      { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 }, // Top Right (0,30)
      { x: TILE_SIZE * 0.5, y: MAZE_HEIGHT - TILE_SIZE * 0.5 } // Bottom Left (30,0)
    ];

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        players: [],
        key: { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT / 2, carrierId: null },
        zoneRadius: MAZE_WIDTH / 1.2,
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
      
      // Dash Collision Check
      if (player.isDashing) {
        for (const pId of room.players) {
          if (pId === socket.id) continue;
          const target = players[pId];
          if (!target || target.hp <= 0) continue;

          const dist = Math.sqrt((player.x - target.x)**2 + (player.y - target.y)**2);
          if (dist < 40) { // Collision radius
            target.hp -= 10;
            const angle = Math.atan2(target.y - player.y, target.x - player.x);
            const kx = Math.cos(angle) * 25;
            const ky = Math.sin(angle) * 25;
            
            // Apply collision-safe knockback
            moveSafely(target, kx, ky);
            
            io.to(player.roomId).emit('player-knockback', { id: pId, x: target.x, y: target.y, vx: kx, vy: ky });
            io.to(player.roomId).emit('play-sound', { x: target.x, y: target.y, type: 'dash-hit' });
            
            player.isDashing = false; // End dash on hit
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
      players: room.players.map(id => players[id]),
      bullets: room.bullets,
      key: room.key,
      keyHoldTime: room.keyHoldTime || 0,
      zoneRadius: room.zoneRadius,
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

    const isWall = MAZE_MAP[nextTileY] && MAZE_MAP[nextTileY][nextTileX] === 1;

    if (isWall) {
      if (b.bounces > 0) {
        let bounced = false;
        // Check which axis was hit specifically at the 'next' step
        const currentTileX = Math.floor(b.x / TILE_SIZE);
        const currentTileY = Math.floor(b.y / TILE_SIZE);

        if (MAZE_MAP[currentTileY] && MAZE_MAP[currentTileY][nextTileX] === 1) {
          b.vx *= -1;
          bounced = true;
        }
        if (MAZE_MAP[nextTileY] && MAZE_MAP[nextTileY][currentTileX] === 1) {
          b.vy *= -1;
          bounced = true;
        }
        
        if (!bounced) { b.vx *= -1; b.vy *= -1; }
        
        b.bounces--;
        io.to(roomId).emit('play-sound', { x: b.x, y: b.y, type: 'ricochet' });
        // Don't advance position on the bounce frame to prevent phasing
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
        
        // Apply Knockback (Collision Safe)
        const kbForce = 15;
        const angle = Math.atan2(b.vy, b.vx);
        const kx = Math.cos(angle) * kbForce;
        const ky = Math.sin(angle) * kbForce;
        
        moveSafely(p, kx, ky);
        io.to(roomId).emit('player-knockback', { id: pId, x: p.x, y: p.y, vx: kx, vy: ky });

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
