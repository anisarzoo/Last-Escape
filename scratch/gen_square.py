
def generate_square_maze(size=33):
    maze = [[0 for _ in range(size)] for _ in range(size)]
    
    # Fill borders with walls (1)
    for i in range(size):
        maze[0][i] = 1
        maze[size-1][i] = 1
        maze[i][0] = 1
        maze[i][size-1] = 1
    
    # Exits (2) - 8 exits
    mid = size // 2
    # Corners
    maze[0][0] = maze[0][1] = 2
    maze[0][size-1] = maze[0][size-2] = 2
    maze[size-1][0] = maze[size-1][1] = 2
    maze[size-1][size-1] = maze[size-1][size-2] = 2
    
    # Mid-points
    maze[0][mid] = 2
    maze[size-1][mid] = 2
    maze[mid][0] = 2
    maze[mid][size-1] = 2
    
    # Center Objective (Key) area
    c_start = mid - 2
    c_end = mid + 2
    
    # Protected walls around center
    for i in range(c_start, c_end + 1):
        maze[c_start][i] = 1
        maze[c_end][i] = 1
        maze[i][c_start] = 1
        maze[i][c_end] = 1
    
    # Small openings in the center walls (rotational)
    maze[c_start][mid] = 0
    maze[c_end][mid] = 0
    maze[mid][c_start] = 0
    maze[mid][c_end] = 0
    
    # Center pillars
    maze[mid-1][mid-1] = 1
    maze[mid-1][mid+1] = 1
    maze[mid+1][mid-1] = 1
    maze[mid+1][mid+1] = 1
    
    # Generate 1/4th of the maze
    quarter_size = size // 2
    for r in range(1, quarter_size):
        for c in range(1, quarter_size):
            if maze[r][c] != 0: continue
            
            # Patterned walls
            if r % 4 == 0 and c % 2 == 0:
                maze[r][c] = 1
            if c % 4 == 0 and r % 2 == 0:
                maze[r][c] = 1
            
            # Pillars
            if (r + c) % 6 == 0 and r > 3 and c > 3:
                maze[r][c] = 1

    # Symmetry rotation
    for r in range(size):
        for c in range(size):
            val = maze[r][c]
            if val != 0:
                maze[c][size-1-r] = val
                maze[size-1-r][size-1-c] = val
                maze[size-1-c][r] = val

    # Add wooden walls (3) at bottlenecks
    for i in range(4, size-4, 8):
        if maze[i][mid] == 0: maze[i][mid] = 3
        if maze[mid][i] == 0: maze[mid][i] = 3
        
    # Extra wooden walls in outer ring
    for i in range(8, size-8, 8):
        if maze[i][i] == 0: maze[i][i] = 3
        if maze[i][size-1-i] == 0: maze[i][size-1-i] = 3

    return maze

def print_maze(maze):
    for row in maze:
        print("[" + ",".join(map(str, row)) + "],")

maze = generate_square_maze(33)
print_maze(maze)
