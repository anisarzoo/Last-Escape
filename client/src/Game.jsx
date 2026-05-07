import React, { useRef, useEffect, useState } from 'react';
import { socket } from './socket';
import { MAZE_MAP, TILE_SIZE, MAZE_WIDTH, MAZE_HEIGHT } from './constants';

const Game = ({ roomData, playerName }) => {
  const canvasRef = useRef(null);
  const posRef = useRef({ x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 });
  const aimAngleRef = useRef(0);
  const [gameState, setGameState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [isSpectating, setIsSpectating] = useState(false);
  const [muzzleFlash, setMuzzleFlash] = useState(0);
  const keysRef = useRef({});

  // Sync initial position
  useEffect(() => {
    if (roomData) {
      const me = roomData.players.find(p => p.id === socket.id);
      if (me) {
        posRef.current = { x: me.x, y: me.y };
      }
    }
  }, [roomData]);

  useEffect(() => {
    const handleKeyDown = (e) => { keysRef.current[e.key] = true; };
    const handleKeyUp = (e) => { keysRef.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let lastTime = performance.now();
    let loopId;

    const gameLoop = (time) => {
      const dt = Math.min(2, (time - lastTime) / 16.66);
      lastTime = time;

      // 1. PHYSICS & INPUT
      if (!gameOver) {
        let step = 5 * dt;
        const localPlayer = gameState?.players.find(p => p.id === socket.id);
        if (localPlayer?.isCarryingTreasure) step *= 1.25;

        // 1. Calculate Raw Input Direction (for stable aiming)
        const keys = keysRef.current;
        let inputX = 0;
        let inputY = 0;
        if (keys['ArrowUp']) inputY -= 1;
        if (keys['ArrowDown']) inputY += 1;
        if (keys['ArrowLeft']) inputX -= 1;
        if (keys['ArrowRight']) inputX += 1;

        let dx = inputX * step;
        let dy = inputY * step;
        if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

        // 2. Stable Aim logic (separate from collision-step)
        let targetAngle = aimAngleRef.current;
        let adx = 0, ady = 0, aimPressed = false;
        if (keys['w'] || keys['W']) { ady -= 1; aimPressed = true; }
        if (keys['s'] || keys['S']) { ady += 1; aimPressed = true; }
        if (keys['a'] || keys['A']) { adx -= 1; aimPressed = true; }
        if (keys['d'] || keys['D']) { adx += 1; aimPressed = true; }

        if (aimPressed) {
          targetAngle = Math.atan2(ady, adx);
        } else if (inputX !== 0 || inputY !== 0) {
          // Use input vector (stable) instead of movement vector (colliding)
          targetAngle = Math.atan2(inputY, inputX);
        }

        // 3. Smooth Angle Transition (Prevents glitchy 180-flips)
        const angleDiff = (targetAngle - aimAngleRef.current + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        aimAngleRef.current += angleDiff * 0.4; // 40% of the way each frame (~6 frames to full turn)

        const r = 14;
        let px = posRef.current.x;
        let py = posRef.current.y;

        // X Collision & Sliding
        let tx = px + dx;
        if (dy !== 0 && dx === 0) tx += ((Math.floor(px / TILE_SIZE) + 0.5) * TILE_SIZE - px) * 0.15;
        let canX = true;
        const xPts = [{x:tx-r,y:py-r},{x:tx+r,y:py-r},{x:tx-r,y:py+r},{x:tx+r,y:py+r}];
        for(let p of xPts) if(MAZE_MAP[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)]===1){canX=false;break;}
        if(canX) px = tx;

        // Y Collision & Sliding
        let ty = py + dy;
        if (dx !== 0 && dy === 0) ty += ((Math.floor(py / TILE_SIZE) + 0.5) * TILE_SIZE - py) * 0.15;
        let canY = true;
        const yPts = [{x:px-r,y:ty-r},{x:px+r,y:ty-r},{x:px-r,y:ty+r},{x:px+r,y:ty+r}];
        for(let p of yPts) if(MAZE_MAP[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)]===1){canY=false;break;}
        if(canY) py = ty;

        const angleChanged = Math.abs(angleDiff) > 0.01;
        if (px !== posRef.current.x || py !== posRef.current.y || angleChanged) {
          posRef.current = { x: px, y: py };
          // aimAngleRef was already updated by interpolation above
          socket.emit('player-move', { x: px, y: py, aimAngle: aimAngleRef.current });
        }

        if (keys[' ']) {
          socket.emit('player-shoot');
          setMuzzleFlash(Date.now());
          keys[' '] = false;
        }
      }

      // 2. RENDERING (Directly use posRef)
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, height);

        const curX = posRef.current.x;
        const curY = posRef.current.y;
        
        let targetX = curX;
        let targetY = curY;

        // Spectate Logic: Follow the killer chain
        if (isSpectating && gameState) {
          const lp = gameState.players.find(p => p.id === socket.id);
          let spectateId = lp?.killedBy;
          
          // Follow the chain: if my killer is dead, watch who killed them
          let targetPlayer = gameState.players.find(p => p.id === spectateId);
          while (targetPlayer && targetPlayer.hp <= 0 && targetPlayer.killedBy && targetPlayer.killedBy !== 'ZONE') {
            targetPlayer = gameState.players.find(p => p.id === targetPlayer.killedBy);
          }

          if (targetPlayer && targetPlayer.hp > 0) {
            targetX = targetPlayer.x;
            targetY = targetPlayer.y;
          } else {
            // Default to map center if everyone is dead or killed by zone
            targetX = MAZE_WIDTH / 2;
            targetY = MAZE_HEIGHT / 2;
          }
        }

        const camX = width / 2 - targetX;
        const camY = height / 2 - targetY;

        ctx.save();
        ctx.translate(camX, camY);

        // Safe Zone Boundary
        if (gameState && !gameState.treasure.carrierId) {
          ctx.save();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
          ctx.lineWidth = 15;
          ctx.beginPath();
          ctx.arc(MAZE_WIDTH / 2, MAZE_HEIGHT / 2, gameState.zoneRadius, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
          ctx.lineWidth = 5;
          ctx.stroke();
          
          ctx.shadowBlur = 30;
          ctx.shadowColor = '#f43f5e';
          ctx.stroke();
          ctx.restore();
        }

        // Grid
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.05)'; ctx.lineWidth = 1;
        for (let x=0; x<MAZE_WIDTH; x+=100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,MAZE_HEIGHT); ctx.stroke(); }
        for (let y=0; y<MAZE_HEIGHT; y+=100) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(MAZE_WIDTH,y); ctx.stroke(); }

        // Maze
        MAZE_MAP.forEach((row, y) => {
          row.forEach((tile, x) => {
            if (tile === 1) {
              const tx=x*TILE_SIZE, ty=y*TILE_SIZE;
              ctx.fillStyle = '#1e293b'; ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2;
              ctx.strokeRect(tx+2, ty+2, TILE_SIZE-4, TILE_SIZE-4);
              ctx.shadowBlur = 8; ctx.shadowColor = '#6366f1';
              ctx.strokeRect(tx+2, ty+2, TILE_SIZE-4, TILE_SIZE-4);
              ctx.shadowBlur = 0;
            } else if (tile === 2) {
              ctx.fillStyle = 'rgba(16, 185, 129, 0.1)'; ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#10b981'; ctx.strokeRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = '#10b981'; ctx.font='900 12px Outfit'; ctx.textAlign='center';
              ctx.fillText('EXIT', x*TILE_SIZE+TILE_SIZE/2, y*TILE_SIZE+TILE_SIZE/2+4);
            }
          });
        });

        if (gameState) {
          gameState.bullets.forEach(b => {
            ctx.fillStyle = '#fde047'; ctx.shadowBlur = 10; ctx.shadowColor = '#fde047';
            ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
          });

          const t = gameState.treasure;
          if (t && !t.carrierId) {
            ctx.save(); ctx.shadowBlur = 25; ctx.shadowColor = '#eab308'; ctx.fillStyle = '#eab308';
            ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font='900 12px Outfit'; ctx.textAlign='center';
            ctx.fillText('TREASURE', t.x, t.y-25); ctx.restore();
          }

          gameState.players.forEach(p => {
            if (p.hp <= 0) return;
            ctx.save();
            const isMe = p.id === socket.id;
            const px = isMe ? curX : p.x;
            const py = isMe ? curY : p.y;
            const pAngle = isMe ? aimAngleRef.current : (p.aimAngle || 0);
            ctx.translate(px, py);

            if (isMe && Date.now() - muzzleFlash < 100) {
              ctx.fillStyle = 'rgba(253, 224, 71, 0.3)';
              ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
            }

            ctx.save(); ctx.rotate(pAngle); ctx.fillStyle = '#94a3b8'; ctx.fillRect(12, -4, 22, 8); ctx.restore();

            const color = isMe ? '#6366f1' : '#f43f5e';
            const grad = ctx.createRadialGradient(0,0,0,0,0,16);
            grad.addColorStop(0, color); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
            if (p.isCarryingTreasure) { ctx.shadowBlur = 20; ctx.shadowColor = '#eab308'; }
            ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); ctx.shadowBlur=0;

            const barW=44, barH=6;
            ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(-barW/2, -38, barW, barH);
            ctx.fillStyle = p.hp > 30 ? '#10b981' : '#f43f5e';
            ctx.fillRect(-barW/2, -38, (p.hp/100)*barW, barH);

            ctx.fillStyle='#fff'; ctx.font='900 12px Outfit'; ctx.textAlign='center';
            ctx.fillText(p.name.toUpperCase(), 0, -45);
            ctx.restore();
          });
        }
        ctx.restore();

        // UI
        const drawPanel = (x, y, w, h) => {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'; ctx.beginPath(); ctx.roundRect(x,y,w,h,16); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();
        };

        const mSize=160, mScale=mSize/MAZE_WIDTH;
        ctx.save(); ctx.translate(24,24); drawPanel(0,0,mSize,mSize);
        MAZE_MAP.forEach((row,y)=>{ row.forEach((tile,x)=>{ if(tile===1){ ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(x*TILE_SIZE*mScale, y*TILE_SIZE*mScale, TILE_SIZE*mScale, TILE_SIZE*mScale); } }); });
        if(gameState){
          if (!gameState.treasure.carrierId) {
            ctx.strokeStyle='rgba(244,63,94,0.5)'; ctx.beginPath(); ctx.arc((MAZE_WIDTH/2)*mScale,(MAZE_HEIGHT/2)*mScale,gameState.zoneRadius*mScale,0,Math.PI*2); ctx.stroke();
          }
          ctx.fillStyle='#eab308'; ctx.beginPath(); ctx.arc(gameState.treasure.x*mScale, gameState.treasure.y*mScale, 4, 0, Math.PI * 2); ctx.fill();
          gameState.players.forEach(p=>{ if(p.hp>0){ ctx.fillStyle=p.id===socket.id?'#6366f1':'#f43f5e'; ctx.beginPath(); ctx.arc((p.id===socket.id?curX:p.x)*mScale, (p.id===socket.id?curY:p.y)*mScale, 3, 0, Math.PI*2); ctx.fill(); }});
        }
        ctx.restore();

        if(gameState){
          const lp = gameState.players.find(p=>p.id===socket.id);
          if(lp){
            const hW=280, hH=100; ctx.save(); ctx.translate(24, height-hH-24); drawPanel(0,0,hW,hH);
            ctx.fillStyle='#fff'; ctx.font='900 14px Outfit'; ctx.fillText(`ROOM: ${roomData.id}`, 20, 30);
            ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(20,45,hW-40,10);
            ctx.fillStyle=lp.hp>30?'#10b981':'#f43f5e'; ctx.fillRect(20,45,(lp.hp/100)*(hW-40),10);
            ctx.fillStyle='#94a3b8'; ctx.font='700 12px Outfit'; ctx.fillText(`KILLS: ${lp.score}`, 20, 80); ctx.fillText(`RANGE: ${lp.range} TILE`, 120, 80); ctx.fillText(`HP: ${lp.hp}`, 220, 80);
            ctx.restore();
          }
        }

        const cW=220, cH=100; ctx.save(); ctx.translate(width-cW-24, height-cH-24); drawPanel(0,0,cW,cH);
        ctx.fillStyle='#fff'; ctx.font='900 12px Outfit'; ctx.fillText('CONTROLS', 20, 25);
        ctx.fillStyle='#94a3b8'; ctx.font='700 11px Outfit'; ctx.fillText('CURSORS : MOVE', 20, 50); ctx.fillText('WASD : AIM', 20, 70); ctx.fillText('SPACE : FIRE', 20, 90); ctx.restore();

        if(gameOver){
          ctx.fillStyle='rgba(2,6,23,0.9)'; ctx.fillRect(0,0,width,height);
          ctx.fillStyle='#fff'; ctx.font='900 64px Outfit'; ctx.textAlign='center';
          ctx.fillText('MATCH TERMINATED', width/2, height/2-20);
          ctx.font='700 32px Outfit'; ctx.fillStyle='#10b981'; ctx.fillText(`WINNER: ${gameOver.winner.toUpperCase()}`, width/2, height/2+40);
          ctx.font='400 18px Outfit'; ctx.fillStyle='#94a3b8'; ctx.fillText('REFRESH TO RE-INITIALIZE', width/2, height/2+100);
        }
      }

      loopId = requestAnimationFrame(gameLoop);
    };

    loopId = requestAnimationFrame(gameLoop);

    socket.on('player-moved', ({ id, x, y }) => {
      if (id === socket.id) {
        const dist = Math.sqrt((posRef.current.x - x)**2 + (posRef.current.y - y)**2);
        if (dist > 50) posRef.current = { x, y };
      }
    });

    socket.on('game-state', setGameState);
    socket.on('game-over', setGameOver);

    return () => {
      cancelAnimationFrame(loopId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      socket.off('player-moved');
      socket.off('game-state');
      socket.off('game-over');
    };
  }, [gameState, gameOver, muzzleFlash]);

  const localPlayer = gameState?.players.find(p => p.id === socket.id);
  const isEliminated = localPlayer && localPlayer.hp <= 0;

  return (
    <div className="game-wrapper">
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} style={{ display: 'block' }} />
      
      {/* Elimination Overlay */}
      {isEliminated && !isSpectating && !gameOver && (
        <div className="elimination-overlay">
          <div className="overlay-content">
            <h1 className="glitch-text">YOU GOT ELIMINATED</h1>
            <p>Killed by: {localPlayer.killedBy === 'ZONE' ? 'THE ZONE' : (gameState?.players.find(p=>p.id===localPlayer.killedBy)?.name || 'Unknown Agent')}</p>
            <div className="overlay-buttons">
              <button onClick={() => setIsSpectating(true)}>SPECTATE KILLER</button>
              <button onClick={() => window.location.reload()}>EXIT TO MENU</button>
            </div>
          </div>
        </div>
      )}

      {/* Spectate Label */}
      {isSpectating && !gameOver && (
        <div className="spectate-label">
          SPECTATING: {
            (() => {
              let sId = localPlayer?.killedBy;
              let target = gameState?.players.find(p => p.id === sId);
              while (target && target.hp <= 0 && target.killedBy && target.killedBy !== 'ZONE') {
                target = gameState?.players.find(p => p.id === target.killedBy);
              }
              return target ? target.name.toUpperCase() : 'MAP OVERVIEW';
            })()
          }
          <button className="spectate-exit-btn" onClick={() => window.location.reload()}>EXIT</button>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="elimination-overlay game-over">
          <div className="overlay-content">
            <h1 className="winner-text">MISSION ACCOMPLISHED</h1>
            <p className="winner-name">WINNER: {gameOver.winner.toUpperCase()}</p>
            <div className="overlay-buttons">
              <button onClick={() => window.location.reload()}>REDEPLOY</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
