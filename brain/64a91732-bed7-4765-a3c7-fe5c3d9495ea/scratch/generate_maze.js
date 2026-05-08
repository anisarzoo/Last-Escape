const ROWS = 43;
const COLS = 41;

const halfR = 21; // 0 to 20
const halfC = 20; // 0 to 19

let maze = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

// Define the top-left quadrant (21x20)
const quadrant = [
  [2,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0],
  [0,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,0,1,0,1],
  [0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
  [1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,1,1,1,1,0],
  [1,0,0,0,1,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0],
  [1,1,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,1],
  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
  [1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,0],
  [1,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0],
  [1,0,1,0,1,1,1,1,1,1,1,0,1,1,1,0,1,1,1,0],
  [1,0,1,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0],
  [1,1,1,0,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0],
  [1,0,1,1,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,1],
  [1,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0],
  [1,0,1,0,1,1,1,1,1,1,1,0,1,1,1,0,1,1,1,0],
  [1,0,1,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
  [1,0,1,0,1,0,1,1,0,1,0,0,0,0,1,0,1,0,1,0],
  [1,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0],
  [1,1,1,0,1,0,1,0,1,0,0,0,0,1,0,1,0,1,0,1]
];

// Center Column (20)
const centerCol = [
  1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1 // Center row will be index 21
];

// Center Row (21)
const centerRowLeft = [
  2,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0
];
const centerPoint = 0; // Center point of the entire maze (21, 20)

// Fill top-left quadrant
for (let r = 0; r < 21; r++) {
  for (let c = 0; c < 20; c++) {
    maze[r][c] = quadrant[r][c];
  }
}

// Fill center column
for (let r = 0; r < 21; r++) {
  maze[r][20] = centerCol[r];
}

// Fill center row
for (let c = 0; c < 20; c++) {
  maze[21][c] = centerRowLeft[c];
}
maze[21][20] = centerPoint;

// Mirror horizontally
for (let r = 0; r < 22; r++) {
  for (let c = 0; c < 20; c++) {
    maze[r][40 - c] = maze[r][c];
  }
}

// Mirror vertically
for (let r = 0; r < 21; r++) {
  for (let c = 0; c < 41; c++) {
    maze[42 - r][c] = maze[r][c];
  }
}

// Ensure 8 fixed exits
// Current exits from quadrant mirroring:
// (0,0), (0,40), (42,0), (42,40) -> 4 corners
// (21,0), (21,40) -> 2 mid-sides
// Need 2 more at top-center and bottom-center?
maze[0][20] = 2;
maze[42][20] = 2;

// Total exits: (0,0), (0,40), (42,0), (42,40), (21,0), (21,40), (0,20), (42,20) = 8.

console.log('export const MAZE_MAP = [');
maze.forEach((row, i) => {
  console.log('  [' + row.join(',') + ']' + (i === ROWS - 1 ? '' : ','));
});
console.log('];');
console.log('');
console.log('export const TILE_SIZE = 60;');
console.log('export const MAZE_WIDTH = MAZE_MAP[0].length * TILE_SIZE;');
console.log('export const MAZE_HEIGHT = MAZE_MAP.length * TILE_SIZE;');
