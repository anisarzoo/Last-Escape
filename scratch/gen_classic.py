
def generate_classic_clean(size=31):
    maze = [[0 for _ in range(size)] for _ in range(size)]
    mid = size // 2
    
    # Borders & Exits
    for i in range(size):
        maze[0][i] = 1
        maze[size-1][i] = 1
        maze[i][0] = 1
        maze[i][size-1] = 1
    
    mid_e = mid
    maze[0][mid_e] = 2
    maze[size-1][mid_e] = 2
    maze[mid_e][0] = 2
    maze[mid_e][size-1] = 2
    
    maze[0][0] = maze[0][1] = 2
    maze[0][size-1] = maze[0][size-2] = 2
    maze[size-1][0] = maze[size-1][1] = 2
    maze[size-1][size-1] = maze[size-1][size-2] = 2

    # Key Protection (Wooden Walls)
    # Surround (mid, mid) with 3s
    maze[mid-1][mid] = 3
    maze[mid+1][mid] = 3
    maze[mid][mid-1] = 3
    maze[mid][mid+1] = 3
    
    # Pathing - 4-way rotational
    for r in range(1, mid):
        for c in range(1, mid):
            # Outer ring walls
            if r % 4 == 0 and c % 4 == 0:
                maze[r][c] = 1
            # Symmetric pillars
            if r == 4 or c == 4:
                if (r + c) % 3 == 0: maze[r][c] = 1
            if r == mid - 3 or c == mid - 3:
                maze[r][c] = 1

    # Apply symmetry
    for r in range(size):
        for c in range(size):
            val = maze[r][c]
            if val != 0:
                maze[c][size-1-r] = val
                maze[size-1-r][size-1-c] = val
                maze[size-1-c][r] = val
                
    # Ensure center cross is clear (except the wooden walls)
    for i in range(1, size-1):
        if i == mid-1 or i == mid or i == mid+1: continue
        maze[i][mid] = 0
        maze[mid][i] = 0

    return maze

def print_maze(maze):
    for row in maze:
        print("[" + ",".join(map(str, row)) + "],")

maze = generate_classic_clean(31)
print_maze(maze)
