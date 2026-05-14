
def generate_square_maze_v2(size=31):
    maze = [[0 for _ in range(size)] for _ in range(size)]
    mid = size // 2
    
    # 1. Borders & Exits
    for i in range(size):
        maze[0][i] = 1
        maze[size-1][i] = 1
        maze[i][0] = 1
        maze[i][size-1] = 1
    
    # 8 Exits (2)
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
    
    # 2. Central Vault (5x5)
    vs = mid - 2
    ve = mid + 2
    for r in range(vs, ve + 1):
        for c in range(vs, ve + 1):
            if r == vs or r == ve or c == vs or c == ve:
                maze[r][c] = 1
    
    # Wooden Doors (3) for Vault
    maze[vs][mid] = 3
    maze[ve][mid] = 3
    maze[mid][vs] = 3
    maze[mid][ve] = 3
    
    # 3. Intermediate Rings / Symmetry
    # We design the top-left quadrant (excluding center cross) and rotate
    for r in range(1, mid):
        for c in range(1, mid):
            if maze[r][c] != 0: continue
            
            # Patterned walls for fair paths
            if r % 4 == 0 and c % 2 == 0:
                maze[r][c] = 1
            if c % 4 == 0 and r % 2 == 0:
                maze[r][c] = 1
                
            # Connect some walls to prevent massive open areas
            if r == mid - 4 and c > 4 and c < mid - 2:
                maze[r][c] = 1
            if c == mid - 4 and r > 4 and r < mid - 2:
                maze[r][c] = 1

    # 4. Apply 4-way rotational symmetry
    for r in range(size):
        for c in range(size):
            val = maze[r][c]
            if val != 0:
                maze[c][size-1-r] = val
                maze[size-1-r][size-1-c] = val
                maze[size-1-c][r] = val
                
    # 5. Clean center-cross corridors
    # Ensure there's a path from mid-exits to the vault doors
    for i in range(1, vs):
        if maze[i][mid] == 1: maze[i][mid] = 0
        if maze[mid][i] == 1: maze[mid][i] = 0
        if maze[size-1-i][mid] == 1: maze[size-1-i][mid] = 0
        if maze[mid][size-1-i] == 1: maze[mid][size-1-i] = 0

    return maze

def print_maze(maze):
    for row in maze:
        print("[" + ",".join(map(str, row)) + "],")

maze = generate_square_maze_v2(31)
print_maze(maze)
