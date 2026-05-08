const SIZE = 41; // Square 41x41
const maze = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

// Helper to set symmetric points (8-way symmetry)
function setSym(r, c, val) {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return;
  maze[r][c] = val;
  maze[SIZE - 1 - r][c] = val;
  maze[r][SIZE - 1 - c] = val;
  maze[SIZE - 1 - r][SIZE - 1 - c] = val;
  
  maze[c][r] = val;
  maze[SIZE - 1 - c][r] = val;
  maze[c][SIZE - 1 - r] = val;
  maze[SIZE - 1 - c][SIZE - 1 - r] = val;
}

// 1. Initial State: Border all around
for (let i = 0; i < SIZE; i++) {
  setSym(0, i, 1);
}

// 2. 8 Exits (Fixed points)
setSym(0, 0, 2);  // 4 Corners
setSym(0, 20, 2); // 4 Mid-points

// 3. Clear paths near exits (8-way symmetric)
setSym(1, 0, 0); 
setSym(0, 1, 0);
setSym(1, 1, 0);
setSym(1, 20, 0);
setSym(20, 1, 0);

// 4. COMPLEXITY: Dense tactical obstacles
// Pillars
for (let i = 4; i < 18; i += 4) {
    for (let j = 4; j < 18; j += 4) {
        setSym(i, j, 1);
        setSym(i+1, j, 1);
        setSym(i, j+1, 1);
        setSym(i+1, j+1, 1);
    }
}

// Diagonal walls for "diagonally start" feel
for (let i = 2; i < 10; i++) {
    setSym(i, i+2, 1);
}

// Cross walls near mid-exits
for (let i = 15; i < 20; i++) {
    setSym(i, 18, 1);
    setSym(i, 22, 1);
}

// 5. Center Chamber (Weak Walls)
setSym(19, 19, 1);
setSym(19, 20, 3);
setSym(20, 19, 3);

// 6. Ensure no walls block the exits
// Clear 2x2 area inside every exit
setSym(1, 0, 0); setSym(1, 1, 0); setSym(0, 1, 0);
setSym(1, 20, 0); setSym(1, 19, 0); setSym(1, 21, 0);
setSym(20, 1, 0); setSym(19, 1, 0); setSym(21, 1, 0);

// Double check symmetry by forcing it one last time
for (let r = 0; r <= 20; r++) {
    for (let c = 0; c <= r; c++) {
        setSym(r, c, maze[r][c]);
    }
}

// Output
let output = 'export const MAZE_MAP = [\n';
maze.forEach((row, i) => {
  output += '  [' + row.join(',') + ']' + (i === SIZE - 1 ? '' : ',\n');
});
output += '\n];\n\n';
output += 'export const TILE_SIZE = 60;\n';
output += 'export const MAZE_WIDTH = MAZE_MAP[0].length * TILE_SIZE;\n';
output += 'export const MAZE_HEIGHT = MAZE_MAP.length * TILE_SIZE;\n';

process.stdout.write(output);
