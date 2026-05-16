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
  { x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 }, // Top-Left
  { x: MAZE_WIDTH - TILE_SIZE * 1.5, y: MAZE_HEIGHT - TILE_SIZE * 1.5 }, // Bottom-Right
  { x: MAZE_WIDTH - TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 }, // Top-Right
  { x: TILE_SIZE * 1.5, y: MAZE_HEIGHT - TILE_SIZE * 1.5 }, // Bottom-Left
  { x: MAZE_WIDTH / 2, y: TILE_SIZE * 1.5 }, // Top-Mid
  { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT - TILE_SIZE * 1.5 }, // Bottom-Mid
  { x: TILE_SIZE * 1.5, y: MAZE_HEIGHT / 2 }, // Left-Mid
  { x: MAZE_WIDTH - TILE_SIZE * 1.5, y: MAZE_HEIGHT / 2 } // Right-Mid
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
  const { interval, ...rest } = room;
  return {
    ...rest,
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
  const roomPlayers = getRoomPlayers(room);
  const occupiedIndices = roomPlayers.map((p) => {
    return spawnPoints.findIndex(sp => 
      Math.abs(sp.x - p.x) < 5 && Math.abs(sp.y - p.y) < 5
    );
  }).filter(idx => idx !== -1);

  if (!isTeamModeRoom(room) || !teamId) {
    // FFA: Find first unoccupied index
    for (let i = 0; i < spawnPoints.length; i++) {
      if (!occupiedIndices.includes(i)) return spawnPoints[i];
    }
    // Final fallback
    return spawnPoints[room.players.length % spawnPoints.length];
  }

  const order = teamSpawnOrder[teamId] || teamSpawnOrder.A;
  // Team Mode: Find first unoccupied index in the team's designated order
  for (const idx of order) {
    if (!occupiedIndices.includes(idx)) return spawnPoints[idx];
  }
  
  // Fallback to first in order
  return spawnPoints[order[0]];
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
      const oldHp1 = killer.hp;
      killer.hp = Math.min(100, killer.hp + 15);
      killer.healthGained += (killer.hp - oldHp1);
      if (wasCarrier) {
        const oldHp2 = killer.hp;
        killer.hp = Math.min(100, killer.hp + 30);
        killer.healthGained += (killer.hp - oldHp2);
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
        allTimePlayers: [], // To track everyone who participated
        mode: selectedMode,
        isTeamMode: config.isTeamMode,
        teamSize: config.teamSize,
        maxPlayers: config.maxPlayers,
        bullets: [],
        maze: JSON.parse(JSON.stringify(MAZE_MAP)), // Deep copy for room-specific destruction
        woodenWallsHP: {}, // Track HP of type 3 tiles
        gameStarted: false,
        hostId: socket.id,
        key: { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT / 2, carrierId: null },
        zoneRadius: Math.sqrt((MAZE_WIDTH / 2) ** 2 + (MAZE_HEIGHT / 2) ** 2) + 200, // Cover all corners + margin
        zoneRemoved: false,
        startTime: null,
        keyPickupTime: null,
        status: 'waiting',
        interval: null
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
      lastReloadTime: 0,
      damageDealt: 0,
      healthGained: 0,
      killedBy: null
    };

    room.players.push(socket.id);
    if (!room.allTimePlayers.find(p => p.id === socket.id)) {
      room.allTimePlayers.push({ id: socket.id, name: playerName });
    }
    io.to(roomId).emit('room-update', buildRoomPayload(room));
    socket.emit('initial-maze', room.maze);
    console.log(`${playerName} joined room ${roomId}`);
  });

  socket.on('rematch', () => {
    const player = players[socket.id];
    const room = rooms[player?.roomId];
    if (player && room && room.hostId === socket.id) {
      // Reset room state
      room.gameStarted = false;
      room.status = 'waiting';
      room.bullets = [];
      room.pickups = [];
      room.abandonedStats = []; // Reset abandoned stats for new game
      room.maze = JSON.parse(JSON.stringify(MAZE_MAP));
      room.woodenWallsHP = {};
      room.key = { x: MAZE_WIDTH / 2, y: MAZE_HEIGHT / 2, carrierId: null };
      room.zoneRadius = Math.sqrt((MAZE_WIDTH / 2) ** 2 + (MAZE_HEIGHT / 2) ** 2) + 200;
      room.zoneRemoved = false;
      room.startTime = null;
      room.keyPickupTime = null;

      // Reset all players in the room
      // First move everyone out of the way so spawn point logic works correctly
      room.players.forEach(pId => {
        const p = players[pId];
        if (p) {
          p.x = -999;
          p.y = -999;
        }
      });

      room.players.forEach(pId => {
        const p = players[pId];
        if (p) {
          const startPos = getSpawnPoint(room, p.teamId);
          p.x = startPos.x;
          p.y = startPos.y;
          p.hp = 100;
          p.score = 0;
          p.range = 5;
          p.isCarryingKey = false;
          p.totalKeyHoldTime = 0;
          p.ammo = 6;
          p.reserveAmmo = 12;
          p.isReloading = false;
          p.isStealth = false;
          p.damageDealt = 0;
          p.healthGained = 0;
          p.killedBy = null;
        }
      });

      io.to(room.id).emit('room-update', buildRoomPayload(room));
      io.to(room.id).emit('initial-maze', room.maze);
      io.to(room.id).emit('rematch-triggered');
    }
  });

  socket.on('switch-team', ({ teamId }) => {
    const player = players[socket.id];
    const room = rooms[player?.roomId];
    if (player && room && !room.gameStarted && room.isTeamMode) {
      if (TEAM_IDS.includes(teamId)) {
        const teamCount = countTeamPlayers(room, teamId);
        if (teamCount < room.teamSize) {
          player.teamId = teamId;
          const startPos = getSpawnPoint(room, teamId);
          player.x = startPos.x;
          player.y = startPos.y;
          io.to(player.roomId).emit('room-update', buildRoomPayload(room));
        } else {
          socket.emit('error', { message: `Team ${teamId === 'A' ? 'Alpha' : 'Bravo'} is full.` });
        }
      }
    }
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
      room.initialPlayerCount = room.players.length; // Track for Last Man Standing check
      io.to(player.roomId).emit('game-started');
      startGameLoop(player.roomId);
    }
  });

  socket.on('player-move', (movement) => {
    const player = players[socket.id];
    const room = rooms[player?.roomId];
    if (player && player.hp > 0 && room && room.gameStarted) {
      // Validate input: clamp to max plausible movement per tick (Anti-speedhack)
      // Increased from 25 to 100 to prevent legitimate dashes + network jitter from causing 'freezes'
      let maxMove = player.isDashing ? 200 : 80;
      if (player.isCarryingKey) maxMove *= 0.9;
      const MAX_MOVE_PER_TICK = maxMove;
      const dx = movement.x - player.x;
      const dy = movement.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MAX_MOVE_PER_TICK) {
        // Clamp to max speed in the attempted direction
        const scale = MAX_MOVE_PER_TICK / dist;
        movement.x = player.x + dx * scale;
        movement.y = player.y + dy * scale;
      }
      // Bounds check
      movement.x = Math.max(-TILE_SIZE, Math.min(MAZE_WIDTH + TILE_SIZE, movement.x));
      movement.y = Math.max(-TILE_SIZE, Math.min(MAZE_HEIGHT + TILE_SIZE, movement.y));
      // Sub-stepping for collision (2 steps)
      const steps = 2;
      let canMove = true;
      let finalX = player.x;
      let finalY = player.y;

      const r = 14;
      const currentPoints = [
        { x: player.x - r, y: player.y - r },
        { x: player.x + r, y: player.y - r },
        { x: player.x - r, y: player.y + r },
        { x: player.x + r, y: player.y + r }
      ];
      const isCurrentlyInExit = currentPoints.some(p => room.maze[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)] === 2);

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const testX = player.x + (movement.x - player.x) * t;
        const testY = player.y + (movement.y - player.y) * t;

        const points = [
          { x: testX - r, y: testY - r },
          { x: testX + r, y: testY - r },
          { x: testX - r, y: testY + r },
          { x: testX + r, y: testY + r }
        ];

        let stepBlocked = false;
        for (const p of points) {
          const tileX = Math.floor(p.x / TILE_SIZE);
          const tileY = Math.floor(p.y / TILE_SIZE);
          const tile = room.maze[tileY]?.[tileX];
          
          if (
            tile === 1 || tile === 3 || 
            (tile === 2 && (!room.key.carrierId || (room.keyPickupTime && (Date.now() - room.keyPickupTime < 120000))) && !isCurrentlyInExit)
          ) {
            stepBlocked = true;
            break;
          }
        }

        if (stepBlocked) {
          canMove = false;
          break;
        } else {
          finalX = testX;
          finalY = testY;
        }
      }
      
      const oldX = player.x;
      const oldY = player.y;

      if (canMove) {
        player.x = movement.x;
        player.y = movement.y;
      } else {
        player.x = finalX;
        player.y = finalY;
        // Only correct if discrepancy is significant (>40px) to avoid jitter on lag
        const dist = Math.sqrt((player.x - movement.x)**2 + (player.y - movement.y)**2);
        if (dist > 40) {
          socket.emit('position-correction', { x: player.x, y: player.y });
        }
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
          if (dist < 40 && (!player.dashHitPlayers || !player.dashHitPlayers.includes(pId))) { // Collision radius + hit once per dash check
            if (!player.dashHitPlayers) player.dashHitPlayers = [];
            player.dashHitPlayers.push(pId);
            const dmg = 25;
            const actualDamage = Math.max(0, Math.min(dmg, target.hp));
            target.hp -= dmg;
            player.damageDealt += actualDamage;
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
      player.dashHitPlayers = [];
      setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].isDashing = false;
          delete players[socket.id].dashHitPlayers;
        }
      }, 400);
    }
  });

  socket.on('player-reload', () => {
    const player = players[socket.id];
    if (player && player.hp > 0 && !player.isReloading && player.ammo < player.maxAmmo && (player.reserveAmmo > 0 || player.isCarryingKey)) {
      player.isReloading = true;
      player.lastReloadTime = Date.now();
      io.to(player.roomId).emit('play-sound', { x: player.x, y: player.y, type: 'reload-start' });
      
      setTimeout(() => {
        const p = players[socket.id];
        if (p && p.isReloading) {
          if (p.isCarryingKey) {
            // Key carrier has infinite reserves
            p.ammo = p.maxAmmo;
            p.isReloading = false;
          } else if (p.reserveAmmo > 0) {
            const needed = p.maxAmmo - p.ammo;
            const toReload = Math.min(needed, p.reserveAmmo);
            p.ammo += toReload;
            p.reserveAmmo -= toReload;
            p.isReloading = false;
          }
          io.to(p.roomId).emit('play-sound', { x: p.x, y: p.y, type: 'reload-end' });
        }
      }, 1500); // 1.5s reload
    }
  });

  socket.on('player-shoot', (data) => {
    const player = players[socket.id];
    const now = Date.now();
    if (player && player.hp > 0 && !player.isReloading && player.ammo > 0 && now - player.lastShotTime > 500) {
      const room = rooms[player.roomId];
      if (room && room.gameStarted) {
        player.lastShotTime = now;
        player.ammo -= 1;
        const angle = data?.aimAngle ?? player.aimAngle;
        const bullet = {
          id: Math.random().toString(36).substr(2, 9),
          ownerId: socket.id,
          x: player.x + Math.cos(angle) * 28,
          y: player.y + Math.sin(angle) * 28,
          vx: Math.cos(angle) * 15,
          vy: Math.sin(angle) * 15,
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
          if (room.interval) clearInterval(room.interval);
          delete rooms[player.roomId];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0];
            const newHost = players[room.hostId];
            if (newHost) newHost.isHost = true;
          }
          socket.to(player.roomId).emit('room-update', buildRoomPayload(room));

          // Track abandoned stats
          if (room.gameStarted) {
            if (!room.abandonedStats) room.abandonedStats = [];
            if (!room.abandonedStats.find(s => s.id === player.id)) {
              room.abandonedStats.push({
                id: player.id,
                name: player.name,
                teamId: player.teamId || null,
                score: player.score,
                damageDealt: Math.round(player.damageDealt || 0),
                healthGained: Math.round(player.healthGained || 0),
                killedBy: player.hp > 0 ? 'ABANDONED' : player.killedBy,
                holdTime: Math.floor(player.totalKeyHoldTime || 0)
              });
            }
          }

          // Last Man Standing: If only one player left in the room, they win
          if (room.gameStarted && room.players.length === 1) {
            const lastPlayerId = room.players[0];
            const lastPlayer = players[lastPlayerId];
            if (lastPlayer) endGame(room, lastPlayer);
          }
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
          if (room.interval) clearInterval(room.interval);
          delete rooms[player.roomId];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0];
            const newHost = players[room.hostId];
            if (newHost) newHost.isHost = true;
          }
          io.to(player.roomId).emit('room-update', buildRoomPayload(room));

          // Track abandoned stats
          if (room.gameStarted) {
            if (!room.abandonedStats) room.abandonedStats = [];
            if (!room.abandonedStats.find(s => s.id === player.id)) {
              room.abandonedStats.push({
                id: player.id,
                name: player.name,
                teamId: player.teamId || null,
                score: player.score,
                damageDealt: Math.round(player.damageDealt || 0),
                healthGained: Math.round(player.healthGained || 0),
                killedBy: player.hp > 0 ? 'ABANDONED' : player.killedBy,
                holdTime: Math.floor(player.totalKeyHoldTime || 0)
              });
            }
          }

          // Last Man Standing: If only one player left in the room, they win
          if (room.gameStarted && room.players.length === 1) {
            const lastPlayerId = room.players[0];
            const lastPlayer = players[lastPlayerId];
            if (lastPlayer) endGame(room, lastPlayer);
          }
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

  if (room.interval) clearInterval(room.interval);

  const TICK_RATE = 30;
  room.interval = setInterval(() => {
    if (!rooms[roomId]) {
      if (room.interval) clearInterval(room.interval);
      return;
    }

    updateRoom(roomId);
    
    if (!room) {
      if (room.interval) clearInterval(room.interval);
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
      exitLockoutRemaining: room.startTime ? Math.max(0, 20 - Math.floor((Date.now() - room.startTime) / 1000)) : 0,
      pickupLockoutRemaining: (room.key.carrierId && room.keyPickupTime) ? Math.max(0, 120 - Math.floor((Date.now() - room.keyPickupTime) / 1000)) : 0,
      time: Math.floor((Date.now() - room.startTime) / 1000),
      woodenWallsHP: room.woodenWallsHP || {}
    });
  }, 1000 / TICK_RATE);
}

function updateRoom(roomId) {
  const room = rooms[roomId];
  if (!room || !room.gameStarted) return;

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
    room.zoneRadius = 99999; // Zone disappears on pickup
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
    const isWoodenWall = room.maze[nextTileY] && room.maze[nextTileY][nextTileX] === 3;

    if (isWall || isWoodenWall) {
      if (isWoodenWall) {
        const wallKey = `${nextTileY},${nextTileX}`;
        
        // Arena Lock: Walls are invulnerable for the first 20s of the game
        const now = Date.now();
        const isLocked = room.startTime && (now - room.startTime < 20000);
        
        if (!isLocked) {
          if (!room.woodenWallsHP[wallKey]) room.woodenWallsHP[wallKey] = 100;
          room.woodenWallsHP[wallKey] -= 25; // 4 shots to break
          
          if (room.woodenWallsHP[wallKey] <= 0) {
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
        const actualDamage = Math.max(0, Math.min(damage, p.hp));
        p.hp -= damage;
        const shooter = players[b.ownerId];
        if (shooter) shooter.damageDealt += actualDamage;
        
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
            const oldHp = p.hp;
            p.hp = Math.min(100, p.hp + 30);
            p.healthGained += (p.hp - oldHp);
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
        room.keyPickupTime = now; // Start the 120s exit gate lockdown
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
      }

      // Win Condition Check: Escape map through corners or reach EXIT tile
      const tileX = Math.floor(carrier.x / TILE_SIZE);
      const tileY = Math.floor(carrier.y / TILE_SIZE);
      const onExitTile = room.maze[tileY] && room.maze[tileY][tileX] === 2;
      const isOutside = carrier.x < -20 || carrier.x > MAZE_WIDTH + 20 || carrier.y < -20 || carrier.y > MAZE_HEIGHT + 20;

      const isExitLocked = room.keyPickupTime && (now - room.keyPickupTime < 120000);
      
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

    // Zone Damage (only applies if outside zone)
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
  if (room.initialPlayerCount > 1) { // Check if the game started with multiple players
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
  
  const activeStats = roomPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    teamId: p.teamId || null,
    score: p.score,
    damageDealt: Math.round(p.damageDealt || 0),
    healthGained: Math.round(p.healthGained || 0),
    killedBy: p.killedBy,
    holdTime: Math.floor(p.totalKeyHoldTime || 0),
    isWinner: room.isTeamMode ? (p.teamId === winnerTeamId && winnerTeamId !== null) : p.id === winner?.id
  }));

  const abandonedStats = (room.abandonedStats || []).map(s => ({
    ...s,
    isWinner: false // Abandoned players cannot win
  }));

  io.to(roomId).emit('game-over', { 
    winner: getWinnerLabel(room, winner),
    winnerTeamId,
    stats: [...activeStats, ...abandonedStats]
  });
  
  room.gameStarted = false;
  room.status = 'finished';
}
