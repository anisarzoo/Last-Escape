import React, { useRef, useEffect, useState } from 'react';
import { socket } from './socket';
import { MAZE_MAP, TILE_SIZE, MAZE_WIDTH, MAZE_HEIGHT } from './constants';

const Game = ({ roomData, playerName }) => {
  const canvasRef = useRef(null);
  const posRef = useRef({ x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 });
  const aimAngleRef = useRef(0);
  const [renderPos, setRenderPos] = useState({ x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 });
  const [gameState, setGameState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [muzzleFlash, setMuzzleFlash] = useState(0);
  const keysRef = useRef({});

  // Sync initial position
  useEffect(() => {
    if (roomData) {
      const me = roomData.players.find(p => p.id === socket.id);
      if (me) {
        posRef.current = { x: me.x, y: me.y };
        setRenderPos({ x: me.x, y: me.y });
      }
    }
  }, [roomData]);

  // Movement & Logic Loop
  useEffect(() => {
    const handleKeyDown = (e) => { keysRef.current[e.key] = true; };
    const handleKeyUp = (e) => { keysRef.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let lastTime = performance.now();
    let moveLoop;

    const update = (time) => {
      const dt = Math.min(2, (time - lastTime) / 16.66);
      lastTime = time;

      if (!gameOver) {
        let step = 5 * dt;
        const localPlayer = gameState?.players.find(p => p.id === socket.id);
        if (localPlayer?.isCarryingTreasure) step *= 1.25;

        const keys = keysRef.current;
        let dx = 0;
        let dy = 0;
        if (keys['ArrowUp']) dy -= step;
        if (keys['ArrowDown']) dy += step;
        if (keys['ArrowLeft']) dx -= step;
        if (keys['ArrowRight']) dx += step;

        if (dx !== 0 && dy !== 0) {
          dx *= 0.7071;
          dy *= 0.7071;
        }

        // Aim logic
        let newAimAngle = aimAngleRef.current;
        let adx = 0, ady = 0, aimPressed = false;
        if (keys['w'] || keys['W']) { ady -= 1; aimPressed = true; }
        if (keys['s'] || keys['S']) { ady += 1; aimPressed = true; }
        if (keys['a'] || keys['A']) { adx -= 1; aimPressed = true; }
        if (keys['d'] || keys['D']) { adx += 1; aimPressed = true; }

        if (aimPressed) {
          newAimAngle = Math.atan2(ady, adx);
        } else if (dx !== 0 || dy !== 0) {
          newAimAngle = Math.atan2(dy, dx);
        }

        const r = 14;
        let finalX = posRef.current.x;
        let finalY = posRef.current.y;

        // X Movement
        let tempX = finalX + dx;
        if (dy !== 0 && dx === 0) tempX += ((Math.floor(finalX / TILE_SIZE) + 0.5) * TILE_SIZE - finalX) * 0.1;
        let canMoveX = true;
        const xPts = [{x:tempX-r, y:finalY-r}, {x:tempX+r, y:finalY-r}, {x:tempX-r, y:finalY+r}, {x:tempX+r, y:finalY+r}];
        for(let p of xPts) if(MAZE_MAP[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)] === 1) { canMoveX=false; break; }
        if(canMoveX) finalX = tempX;

        // Y Movement
        let tempY = finalY + dy;
        if (dx !== 0 && dy === 0) tempY += ((Math.floor(finalY / TILE_SIZE) + 0.5) * TILE_SIZE - finalY) * 0.1;
        let canMoveY = true;
        const yPts = [{x:finalX-r, y:tempY-r}, {x:finalX+r, y:tempY-r}, {x:finalX-r, y:tempY+r}, {x:finalX+r, y:tempY+r}];
        for(let p of yPts) if(MAZE_MAP[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)] === 1) { canMoveY=false; break; }
        if(canMoveY) finalY = tempY;

        if (finalX !== posRef.current.x || finalY !== posRef.current.y || newAimAngle !== aimAngleRef.current) {
          posRef.current = { x: finalX, y: finalY };
          aimAngleRef.current = newAimAngle;
          setRenderPos({ x: finalX, y: finalY });
          socket.emit('player-move', { ...posRef.current, aimAngle: newAimAngle });
        }

        if (keys[' ']) {
          socket.emit('player-shoot');
          setMuzzleFlash(Date.now());
          keys[' '] = false;
        }
      }
      moveLoop = requestAnimationFrame(update);
    };

    moveLoop = requestAnimationFrame(update);

    socket.on('player-moved', ({ id, x, y }) => {
      if (id === socket.id) {
        const dist = Math.sqrt((posRef.current.x - x)**2 + (posRef.current.y - y)**2);
        if (dist > 50) {
          posRef.current = { x, y };
          setRenderPos({ x, y });
        }
      }
    });

    socket.on('game-state', setGameState);
    socket.on('game-over', setGameOver);

    return () => {
      cancelAnimationFrame(moveLoop);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      socket.off('player-moved');
      socket.off('game-state');
      socket.off('game-over');
    };
  }, [gameOver]);

  // Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      const { innerWidth: width, innerHeight: height } = window;
      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);
      
      const camX = width / 2 - renderPos.x;
      const camY = height / 2 - renderPos.y;
      
      ctx.save();
      ctx.translate(camX, camY);

      // Grid
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < MAZE_WIDTH; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAZE_HEIGHT); ctx.stroke();
      }
      for (let y = 0; y < MAZE_HEIGHT; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAZE_WIDTH, y); ctx.stroke();
      }

      // Maze
      MAZE_MAP.forEach((row, y) => {
        row.forEach((tile, x) => {
          const tx = x * TILE_SIZE;
          const ty = y * TILE_SIZE;
          if (tile === 1) {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 2;
            ctx.strokeRect(tx + 2, ty + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.shadowBlur = 10; ctx.shadowColor = '#6366f1';
            ctx.strokeRect(tx + 2, ty + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.shadowBlur = 0;
          } else if (tile === 2) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
            ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#10b981';
            ctx.font = '900 12px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('EXIT', tx + TILE_SIZE/2, ty + TILE_SIZE/2 + 4);
          }
        });
      });

      if (gameState) {
        // Bullets
        gameState.bullets.forEach(b => {
          ctx.fillStyle = '#fde047';
          ctx.shadowBlur = 15; ctx.shadowColor = '#fde047';
          ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        });

        // Treasure
        const t = gameState.treasure;
        if (t && !t.carrierId) {
          ctx.save();
          ctx.shadowBlur = 30; ctx.shadowColor = '#eab308';
          ctx.fillStyle = '#eab308';
          ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = '900 12px Outfit'; ctx.textAlign = 'center';
          ctx.fillText('TREASURE', t.x, t.y - 25);
          ctx.restore();
        }

        // Players
        gameState.players.forEach(p => {
          if (p.hp <= 0) return;
          ctx.save();
          const isMe = p.id === socket.id;
          const px = isMe ? renderPos.x : p.x;
          const py = isMe ? renderPos.y : p.y;
          const pAngle = isMe ? aimAngleRef.current : (p.aimAngle || 0);
          ctx.translate(px, py);
          
          if (isMe && Date.now() - muzzleFlash < 100) {
            ctx.fillStyle = 'rgba(253, 224, 71, 0.4)';
            ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
          }

          ctx.save(); ctx.rotate(pAngle); ctx.fillStyle = '#94a3b8'; ctx.fillRect(12, -4, 22, 8); ctx.restore();

          const color = isMe ? '#6366f1' : '#f43f5e';
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
          grad.addColorStop(0, color); grad.addColorStop(1, '#000');
          ctx.fillStyle = grad;
          if (p.isCarryingTreasure) { ctx.shadowBlur = 25; ctx.shadowColor = '#eab308'; }
          ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;

          const barW = 44, barH = 6;
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-barW/2, -38, barW, barH);
          ctx.fillStyle = p.hp > 30 ? '#10b981' : '#f43f5e';
          ctx.fillRect(-barW/2, -38, (p.hp / 100) * barW, barH);

          ctx.fillStyle = '#fff'; ctx.font = '900 12px Outfit'; ctx.textAlign = 'center';
          ctx.fillText(p.name.toUpperCase(), 0, -45);
          ctx.restore();
        });
      }
      ctx.restore();

      // UI
      const drawPanel = (x, y, w, h) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 1; ctx.stroke();
      };

      // Minimap
      const mSize = 160, mScale = mSize / MAZE_WIDTH;
      ctx.save(); ctx.translate(24, 24); drawPanel(0, 0, mSize, mSize);
      MAZE_MAP.forEach((row, y) => {
        row.forEach((tile, x) => {
          if (tile === 1) { ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(x * TILE_SIZE * mScale, y * TILE_SIZE * mScale, TILE_SIZE * mScale, TILE_SIZE * mScale); }
        });
      });
      if (gameState) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)'; ctx.beginPath(); ctx.arc((MAZE_WIDTH/2) * mScale, (MAZE_HEIGHT/2) * mScale, gameState.zoneRadius * mScale, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#eab308'; ctx.beginPath(); ctx.arc(gameState.treasure.x * mScale, gameState.treasure.y * mScale, 4, 0, Math.PI * 2); ctx.fill();
        gameState.players.forEach(p => {
          if (p.hp <= 0) return;
          ctx.fillStyle = p.id === socket.id ? '#6366f1' : '#f43f5e';
          const px = p.id === socket.id ? renderPos.x : p.x;
          const py = p.id === socket.id ? renderPos.y : p.y;
          ctx.beginPath(); ctx.arc(px * mScale, py * mScale, 3, 0, Math.PI * 2); ctx.fill();
        });
      }
      ctx.restore();

      if (gameState) {
        const lp = gameState.players.find(p => p.id === socket.id);
        if (lp) {
          const hudW = 280, hudH = 100;
          ctx.save(); ctx.translate(24, height - hudH - 24); drawPanel(0, 0, hudW, hudH);
          ctx.fillStyle = '#fff'; ctx.font = '900 14px Outfit'; ctx.fillText(`ROOM: ${roomData.id}`, 20, 30);
          ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(20, 45, hudW - 40, 10);
          ctx.fillStyle = lp.hp > 30 ? '#10b981' : '#f43f5e'; ctx.fillRect(20, 45, (lp.hp/100) * (hudW - 40), 10);
          ctx.fillStyle = '#94a3b8'; ctx.font = '700 12px Outfit';
          ctx.fillText(`KILLS: ${lp.score}`, 20, 80); ctx.fillText(`RANGE: ${lp.range} TILE`, 120, 80); ctx.fillText(`HP: ${lp.hp}`, 220, 80);
          ctx.restore();
        }
      }

      const ctrlW = 220, ctrlH = 100;
      ctx.save(); ctx.translate(width - ctrlW - 24, height - ctrlH - 24); drawPanel(0, 0, ctrlW, ctrlH);
      ctx.fillStyle = '#fff'; ctx.font = '900 12px Outfit'; ctx.fillText('CONTROLS', 20, 25);
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px Outfit';
      ctx.fillText('CURSORS : MOVE', 20, 50); ctx.fillText('WASD : AIM', 20, 70); ctx.fillText('SPACE : FIRE', 20, 90);
      ctx.restore();

      if (gameOver) {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.9)'; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#fff'; ctx.font = '900 64px Outfit'; ctx.textAlign = 'center';
        ctx.fillText('MATCH TERMINATED', width / 2, height / 2 - 20);
        ctx.font = '700 32px Outfit'; ctx.fillStyle = '#10b981'; ctx.fillText(`WINNER: ${gameOver.winner.toUpperCase()}`, width / 2, height / 2 + 40);
        ctx.font = '400 18px Outfit'; ctx.fillStyle = '#94a3b8'; ctx.fillText('REFRESH TO RE-INITIALIZE', width / 2, height / 2 + 100);
      }
      animationFrameId = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [renderPos, gameState, gameOver]);

  return (
    <div className="game-wrapper">
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} style={{ display: 'block' }} />
    </div>
  );
};

export default Game;
