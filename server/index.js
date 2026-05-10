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

const GAME_MODES = {
  FFA: 'ffa',
  TWO_V_TWO: '2v2',
  FOUR_V_FOUR: '4v4'
};

const MODE_CONFIG = {
  [GAME_MODES.FFA]: { maxPlayers: 8, teamSize: 1, isTeamMode: false },
  [GAME_MODES.TWO_V_TWO]: { maxPlayers: 4, teamSize: 2, isTeamMode: true },
  [GAME_MODES.FOUR_V_FOUR]: { maxPlayers: 8, teamSize: 4, isTeamMode: true }
};

const TEAM_IDS = ['A', 'B'];

const spawnPoints = [
  { x: TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 }, // Top-Left
  { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: MAZE_HEIGHT - TILE_SIZE * 0.5 }, // Bottom-Right
  { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 }, // Top-Right
  { x: TILE_SIZE * 0.5, y: MAZE_HEIGHT - TILE_SIZE * 0.5 }, // Bottom-Left
  { x: MAZE_WIDTH / 2, y: TILE_SIZE * 0.5 }, // Top-Mid
  { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT - TILE_SIZE * 0.5 }, // Bottom-Mid
  { x: TILE_SIZE * 0.5, y: MAZE_HEIGHT / 2 }, // Left-Mid
  { x: MAZE_WIDTH - TILE_SIZE * 0.5, y: MAZE_HEIGHT / 2 } // Right-Mid
];

const teamSpawnOrder = {
  A: [0, 3, 4, 6],
  B: [2, 1, 5, 7]
};

function sanitizeMode(mode) {
  if (mode === GAME_MODES.TWO_V_TWO || mode === GAME_MODES.FOUR_V_FOUR) return mode;
  return GAME_MODES.FFA;
}

function getModeConfig(mode) {
  return MODE_CONFIG[sanitizeMode(mode)];
}

function isTeamModeRoom(room) {
  return !!room?.isTeamMode;
}

function getRoomPlayers(room) {
  return room.players.map((id) => players[id]).filter(Boolean);
}

function buildRoomPayload(room) {
  return {
    ...room,
    players: getRoomPlayers(room)
  };
}

function countTeamPlayers(room, teamId) {
  return room.players.reduce((count, id) => {
    const p = players[id];
    return p && p.teamId === teamId ? count + 1 : count;
  }, 0);
}

function assignTeamId(room) {
  if (!isTeamModeRoom(room)) return null;

  const countA = countTeamPlayers(room, 'A');
  const countB = countTeamPlayers(room, 'B');

  if (countA < room.teamSize && (countA <= countB || countB >= room.teamSize)) return 'A';
  if (countB < room.teamSize) return 'B';
  return null;
}

function getSpawnPoint(room, teamId) {
  if (!isTeamModeRoom(room) || !teamId) {
    return spawnPoints[room.players.length % spawnPoints.length];
  }

  const existingTeamCount = countTeamPlayers(room, teamId);
  const order = teamSpawnOrder[teamId] || teamSpawnOrder.A;
  const index = order[existingTeamCount % order.length];
  return spawnPoints[index];
}

function isTeammates(room, aId, bId) {
  if (!isTeamModeRoom(room)) return false;
  const a = players[aId];
  const b = players[bId];
  return !!a && !!b && a.teamId && a.teamId === b.teamId;
}

function dropKey(room, player) {
  if (!player) return;
  player.isCarryingKey = false;
  player.isStealth = false; // Reset stealth on drop
  if (room.key.carrierId === player.id) {
    room.key.carrierId = null;
    room.key.x = player.x;
    room.key.y = player.y;
    room.keyHoldTime = 0;
    room.lastKeyUpdate = null;
  }
}

function applyElimination(room, victim, killerId) {
  if (!victim || victim.hp > 0) return;

  const wasCarrier = victim.isCarryingKey;
  victim.hp = 0;

  if (killerId && killerId !== 'ZONE') {
    const killer = players[killerId];
    if (killer) {
      killer.score += 1;
      killer.range = Math.min(8, killer.range + 1);
      victim.killedBy = killer.id;
      killer.hp = Math.min(100, killer.hp + 15);
      if (wasCarrier) {
        killer.hp = Math.min(100, killer.hp + 30);
      }
    } else {
      victim.killedBy = 'ZONE';
    }
  } else {
    victim.killedBy = 'ZONE';
  }

  if (wasCarrier) {
    dropKey(room, victim);
  }
}

function getWinnerLabel(room, carrier) {
  if (room.isTeamMode && carrier.teamId) {
    return `TEAM ${carrier.teamId}`;
  }
  return carrier.name;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('ping', (callback) => {
    if (typeof callback === 'function') callback();
  });

  socket.on('join-room', ({ roomId, playerName, create, mode }) => {
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
      if (rooms[roomId].players.length >= rooms[roomId].maxPlayers) {
        socket.emit('error', { message: `Room is full (Max ${rooms[roomId].maxPlayers} players)` });
        return;
      }
    }

    if (!rooms[roomId]) {
      const selectedMode = sanitizeMode(mode);
      const config = getModeConfig(selectedMode);
      rooms[roomId] = {
        id: roomId,
        players: [],
        mode: selectedMode,
        isTeamMode: config.isTeamMode,
        teamSize: config.teamSize,
        maxPlayers: config.maxPlayers,
        bullets: [],
        maze: JSON.parse(JSON.stringify(MAZE_MAP)), // Deep copy for room-specific destruction
        weakWallsHP: {}, // Track HP of type 3 tiles
        gameStarted: false,
        hostId: socket.id,
        key: { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT / 2, carrierId: null },
        zoneRadius: Math.sqrt((MAZE_WIDTH / 2) ** 2 + (MAZE_HEIGHT / 2) ** 2) + 200, // Cover all corners + margin
        zoneRemoved: false,
        startTime: null,
        keyPickupTime: null,
        status: 'waiting'
      };
    }

    const room = rooms[roomId];
    const teamId = assignTeamId(room);
    if (room.isTeamMode && !teamId) {
      socket.emit('error', { message: 'Unable to assign team. Room is already balanced and full.' });
      return;
    }

    socket.join(roomId);

    const startPos = getSpawnPoint(room, teamId);

    players[socket.id] = {
      id: socket.id,
      name: playerName,
      roomId,
      teamId,
      x: startPos.x,
      y: startPos.y,
      hp: 100,
      score: 0,
      range: 5,
      isCarryingKey: false,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      isHost: room.hostId === socket.id,
      lastShotTime: 0,
      aimAngle: 0,
      totalKeyHoldTime: 0,
      lastDashTime: 0,
      isDashing: false,
      ammo: 6,
      maxAmmo: 6,
      reserveAmmo: 12,
      isReloading: false,
      lastReloadTime: 0
    };

    room.players.push(socket.id);
    io.to(roomId).emit('room-update', buildRoomPayload(room));
    socket.emit('initial-maze', room.maze);
    console.log(`${playerName} joined room ${roomId}`);
  });

  socket.on('start-game', () => {
    const player = players[socket.id];
    const room = rooms[player?.roomId];
    if (player && room && room.hostId === socket.id) {
      if (room.players.length < 2) {
        socket.emit('error', { message: 'Need at least 2 players to start.' });
        return;
      }

      if (room.isTeamMode) {
        if (room.players.length !== room.maxPlayers) {
          socket.emit('error', { message: `${room.mode.toUpperCase()} requires exactly ${room.maxPlayers} players.` });
          return;
        }

        const teamA = countTeamPlayers(room, 'A');
        const teamB = countTeamPlayers(room, 'B');
        if (teamA !== room.teamSize || teamB !== room.teamSize) {
          socket.emit('error', { message: `Teams must be balanced (${room.teamSize}v${room.teamSize}).` });
          return;
        }
      }

      room.gameStarted = true;
      room.startTime = Date.now();
      room.keyHoldTime = 0;
      room.lastKeyUpdate = null;
      io.to(player.roomId).emit('game-started');
      startGameLoop(player.roomId);
    }
  });

  socket.on('player-move', (movement) => {
    const player = players[socket.id];
    const room = rooms[player?.roomId];
    if (player && player.hp > 0 && room && room.gameStarted) {
      // Radius-based collision check
      const r = 14;
      const points = [
        { x: movement.x - r, y: movement.y - r },
        { x: movement.x + r, y: movement.y - r },
        { x: movement.x - r, y: movement.y + r },
        { x: movement.x + r, y: movement.y + r }
      ];

      let canMove = true;
      const isCurrentlyInExit = points.some(p => room.maze[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)] === 2);

      for (const p of points) {
        const tileX = Math.floor(p.x / TILE_SIZE);
        const tileY = Math.floor(p.y / TILE_SIZE);
        
        if (
          tileY >= 0 && tileY < room.maze.length &&
          tileX >= 0 && tileX < room.maze[0].length &&
          (room.maze[tileY][tileX] === 1 || room.maze[tileY][tileX] === 3 || (room.maze[tileY][tileX] === 2 && (!room.key.carrierId || (room.keyPickupTime && (Date.now() - room.keyPickupTime < 60000))) && !isCurrentlyInExit))
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
          if (isTeammates(room, socket.id, pId)) continue;
          const target = players[pId];
          if (!target || target.hp <= 0) continue;

          const dist = Math.sqrt((player.x - target.x)**2 + (player.y - target.y)**2);
          if (dist < 40) { // Collision radius
            target.hp -= 10;
            if (target.hp <= 0) {
              applyElimination(room, target, socket.id);
            }
            
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
    }
  });

  socket.on('player-dash', () => {
    const player = players[socket.id];
    if (player && player.hp > 0 && Date.now() - player.lastDashTime > 4000) {
      player.lastDashTime = Date.now();
      player.isDashing = true;
      setTimeout(() => {
        if (players[socket.id]) players[socket.id].isDashing = false;
      }, 150);
    }
  });

  socket.on('player-reload', () => {
    const player = players[socket.id];
    if (player && player.hp > 0 && !player.isReloading && player.ammo < player.maxAmmo && player.reserveAmmo > 0) {
      player.isReloading = true;
      player.lastReloadTime = Date.now();
      io.to(player.roomId).emit('play-sound', { x: player.x, y: player.y, type: 'reload-start' });
      
      setTimeout(() => {
        const p = players[socket.id];
        if (p && p.isReloading) {
          const needed = p.maxAmmo - p.ammo;
          const toReload = Math.min(needed, p.reserveAmmo);
          p.ammo += toReload;
          p.reserveAmmo -= toReload;
          p.isReloading = false;
          io.to(p.roomId).emit('play-sound', { x: p.x, y: p.y, type: 'reload-end' });
        }
      }, 1500); // 1.5s reload
    }
  });

  socket.on('player-shoot', () => {
    const player = players[socket.id];
    const now = Date.now();
    if (player && player.hp > 0 && !player.isReloading && player.ammo > 0 && now - player.lastShotTime > 500) {
      const room = rooms[player.roomId];
      if (room && room.gameStarted) {
        player.lastShotTime = now;
        player.ammo -= 1;
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

  socket.on('leave-room', () => {
    const player = players[socket.id];
    if (player) {
      const room = rooms[player.roomId];
      if (room) {
        if (room.key.carrierId === socket.id) {
          dropKey(room, player);
        }
        room.players = room.players.filter(id => id !== socket.id);
        if (room.players.length === 0) {
          delete rooms[player.roomId];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0];
            const newHost = players[room.hostId];
            if (newHost) newHost.isHost = true;
          }
          io.to(player.roomId).emit('room-update', buildRoomPayload(room));
        }
        socket.leave(player.roomId);
      }
      delete players[socket.id];
    }
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const room = rooms[player.roomId];
      if (room) {
        // Drop key if carrier disconnects
        if (room.key.carrierId === socket.id) {
          dropKey(room, player);
        }
        
        room.players = room.players.filter(id => id !== socket.id);
        if (room.players.length === 0) {
          delete rooms[player.roomId];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0];
            const newHost = players[room.hostId];
            if (newHost) newHost.isHost = true;
          }
          io.to(player.roomId).emit('room-update', buildRoomPayload(room));
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
  if (!rooms[roomId]) return;

  const TICK_RATE = 30;
  const interval = setInterval(() => {
    if (!rooms[roomId]) {
      clearInterval(interval);
      return;
    }

    updateRoom(roomId);
    const room = rooms[roomId];
    if (!room) {
      clearInterval(interval);
      return;
    }

    io.to(roomId).emit('game-state', {
      mode: room.mode,
      isTeamMode: room.isTeamMode,
      players: getRoomPlayers(room).map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        hp: p.hp,
        aimAngle: p.aimAngle,
        isCarryingKey: p.isCarryingKey,
        score: p.score,
        name: p.name,
        color: p.color,
        range: p.range,
        killedBy: p.killedBy || null,
        teamId: p.teamId || null,
        ammo: p.ammo,
        maxAmmo: p.maxAmmo,
        reserveAmmo: p.reserveAmmo,
        isReloading: p.isReloading,
        lastReloadTime: p.lastReloadTime,
        isStealth: p.isStealth || false
      })),
      bullets: room.bullets.map(b => ({ 
        id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, bounces: b.bounces 
      })),
      pickups: room.pickups || [],
      key: room.key,
      keyHoldTime: room.keyHoldTime || 0,
      zoneRadius: room.zoneRadius,
      exitLockoutRemaining: room.startTime ? Math.max(0, 30 - Math.floor((Date.now() - room.startTime) / 1000)) : 0,
      pickupLockoutRemaining: (room.key.carrierId && room.keyPickupTime) ? Math.max(0, 60 - Math.floor((Date.now() - room.keyPickupTime) / 1000)) : 0,
      time: Math.floor((Date.now() - room.startTime) / 1000),
      weakWallsHP: room.weakWallsHP || {}
    });
  }, 1000 / TICK_RATE);
}

function updateRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  // Handle Pickups Spawning
  if (!room.lastPickupSpawn || Date.now() - room.lastPickupSpawn > 10000) {
    room.lastPickupSpawn = Date.now();
    if (!room.pickups) room.pickups = [];
    if (room.pickups.length < 5) {
      // Find a random empty spot
      let spawnX, spawnY, valid = false;
      for(let i=0; i<10; i++) {
        spawnX = Math.floor(Math.random() * (MAZE_WIDTH / TILE_SIZE));
        spawnY = Math.floor(Math.random() * (MAZE_HEIGHT / TILE_SIZE));
        if (room.maze[spawnY][spawnX] === 0) {
          valid = true;
          break;
        }
      }
      if (valid) {
        room.pickups.push({
          id: Math.random().toString(36).substr(2, 9),
          x: (spawnX + 0.5) * TILE_SIZE,
          y: (spawnY + 0.5) * TILE_SIZE,
          type: Math.random() > 0.5 ? 'health' : 'ammo'
        });
      }
    }
  }

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
        
        // Arena Lock: Walls are invulnerable for the first 30s of the game
        const now = Date.now();
        const isLocked = room.startTime && (now - room.startTime < 30000);
        
        if (!isLocked) {
          if (!room.weakWallsHP[wallKey]) room.weakWallsHP[wallKey] = 100;
          room.weakWallsHP[wallKey] -= 25; // 4 shots to break
          
          if (room.weakWallsHP[wallKey] <= 0) {
            room.maze[nextTileY][nextTileX] = 0;
            io.to(roomId).emit('maze-update', { x: nextTileX, y: nextTileY, type: 0 });
            io.to(roomId).emit('play-sound', { x: nextX, y: nextY, type: 'hit' });
          } else {
            io.to(roomId).emit('play-sound', { x: nextX, y: nextY, type: 'ricochet' });
          }
        } else {
          // Optional: sound for invulnerable hit
          io.to(roomId).emit('play-sound', { x: nextX, y: nextY, type: 'ricochet' });
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
      if (isTeammates(room, b.ownerId, pId)) continue;
      const p = players[pId];
      if (!p || p.hp <= 0) continue;

      const dist = Math.sqrt((b.x - p.x)**2 + (b.y - p.y)**2);
      if (dist < 20) {
        const damage = p.isCarryingKey ? 18 : 20;
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
          applyElimination(room, p, b.ownerId);
        }
        
        // Damage Event for UI
        io.to(roomId).emit('damage-dealt', { x: p.x, y: p.y, amount: damage });
        
        break;
      }
    }
  }

  // Check Pickup Collisions
  if (room.pickups) {
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const pick = room.pickups[i];
      for (const pId of room.players) {
        const p = players[pId];
        if (!p || p.hp <= 0) continue;
        const dist = Math.sqrt((p.x - pick.x)**2 + (p.y - pick.y)**2);
        if (dist < 30) {
          if (pick.type === 'health' && p.hp < 100) {
            p.hp = Math.min(100, p.hp + 30);
            room.pickups.splice(i, 1);
            io.to(roomId).emit('play-sound', { x: p.x, y: p.y, type: 'pickup-health' });
            break;
          } else if (pick.type === 'ammo') {
            p.reserveAmmo += 12;
            room.pickups.splice(i, 1);
            io.to(roomId).emit('play-sound', { x: p.x, y: p.y, type: 'pickup-ammo' });
            break;
          }
        }
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
        p.isStealth = true;
        p.stealthStartTime = now;
        room.key.carrierId = pId;
        room.lastKeyUpdate = now;
        room.keyPickupTime = now; // Start the 30s exit wall cooldown
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
          if (isTeammates(room, room.key.carrierId, pId)) continue;
          const p = players[pId];
          if (p && p.hp > 0) {
            p.hp -= drainAmount;
            if (p.hp <= 0) {
              applyElimination(room, p, room.key.carrierId);
            }
          }
        }
      }

      // Win Condition Check: Escape map through corners or reach EXIT tile
      const tileX = Math.floor(carrier.x / TILE_SIZE);
      const tileY = Math.floor(carrier.y / TILE_SIZE);
      const onExitTile = MAZE_MAP[tileY] && MAZE_MAP[tileY][tileX] === 2;
      const isOutside = carrier.x < -20 || carrier.x > MAZE_WIDTH + 20 || carrier.y < -20 || carrier.y > MAZE_HEIGHT + 20;

      const isExitLocked = room.keyPickupTime && (now - room.keyPickupTime < 60000);
      
      if ((onExitTile || isOutside) && !isExitLocked) {
        endGame(room, carrier);
        return;
      }

      // Handle Stealth Timeout
      if (carrier.isStealth && now - carrier.stealthStartTime > 5000) {
        carrier.isStealth = false;
      }
    } else {
      room.key.carrierId = null;
      room.keyHoldTime = 0;
      room.lastKeyUpdate = null;
      room.keyPickupTime = null; // Reset lockout if key is dropped
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
        applyElimination(room, p, 'ZONE');
      }
      if (p.isCarryingKey) {
        dropKey(room, p);
      }
    }
  }

  // Last Man Standing Check
  const alivePlayers = room.players.map(id => players[id]).filter(p => p && p.hp > 0);
  if (room.players.length > 1) { // Only check if the game started with multiple players
    if (room.isTeamMode) {
      const aliveTeams = new Set(alivePlayers.map(p => p.teamId));
      if (aliveTeams.size === 1) {
        const winningTeamId = Array.from(aliveTeams)[0];
        const winner = alivePlayers.find(p => p.teamId === winningTeamId);
        endGame(room, winner);
        return;
      }
    } else {
      if (alivePlayers.length === 1) {
        endGame(room, alivePlayers[0]);
        return;
      }
    }
  }
}

function endGame(room, winner) {
  const roomId = room.id;
  const winnerTeamId = room.isTeamMode ? (winner?.teamId || null) : null;
  const roomPlayers = getRoomPlayers(room);
  
  io.to(roomId).emit('game-over', { 
    winner: getWinnerLabel(room, winner),
    winnerTeamId,
    stats: roomPlayers.map((p) => ({
      name: p.name,
      teamId: p.teamId || null,
      score: p.score,
      holdTime: Math.floor(p.totalKeyHoldTime || 0),
      isWinner: room.isTeamMode ? (p.teamId === winnerTeamId && winnerTeamId !== null) : p.id === winner?.id
    }))
  });
  delete rooms[roomId];
}
