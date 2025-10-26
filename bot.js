import { io } from "socket.io-client";
import dotenv from "dotenv";

dotenv.config();

const socket = io(process.env.SOCKET_SERVER, {
  auth: { token: process.env.TOKEN },
  reconnectionAttempts: 3,
  timeout: 5000
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
  socket.emit("join");
});

socket.on("disconnect", (reason) => {
  console.log("⚠️ Socket disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.error("❌ Connect error:", err.message);
});

var start = {};
var walls = [];
var bombs = [];
var wallPositions = []
var wallsItems = []
var realStart = {}
var inDanger = false
var speed = 1
var range = 2
var items = []
var goItem
var mode = true
var myBombCount = 1

socket.emit("join");

socket.on("user", (obj) => {
  for (let y = 0; y < obj.map.length; y++) {
    const row = obj.map[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'W') {
        wallPositions.push({ x: x, y: y });
      }
    }
  }
  
  wallsItems = obj.chests.filter(item => !item.isDestroyed).map(item => ({ x: item.x / 40, y: item.y / 40 }))

  walls = wallsItems.concat(wallPositions)

  realStart = obj.bombers.filter(item => item.name == "aka000").map(item => ({ x: item.x, y: item.y }))[0]
  
  start = snapToNearestGrid(realStart)
})

socket.on("new_life", (obj) => {
  if (obj.killed.name == "aka00") {
    realStart = {x: obj.killed.x, y: obj.killed.y}
    start = snapToNearestGrid(realStart)
  }
})

socket.on("new_bomb", (obj) => {
  if (obj.ownerName == "aka000") {
    myBombCount--
    mode = true
  }
  bombs.push({
    x: obj.x / 40, y: obj.y / 40, range: obj.explosionRange, name: obj.ownerName
  })
});

socket.on("bomb_explode", (obj) => {
  if (bombs.filter(item => item.x == obj.x / 40 && item.y == obj.y / 40)[0] && bombs.filter(item => item.x == obj.x / 40 && item.y == obj.y / 40)[0].name == "aka000") {
    myBombCount++
  }
  bombs = bombs.filter(item => item.x != obj.x / 40 || item.y != obj.y / 40 );
});

socket.on("map_update", (obj) => {
  wallsItems = obj.chests.filter(item => !item.isDestroyed).map(item => ({ x: item.x / 40, y: item.y / 40 }))
  walls = wallsItems.concat(wallPositions)

  items = obj.items.map(item => ({x: item.x / 40, y: item.y / 40}))
});

socket.on("item_collected", (obj) => {
  items = items.filter(item => item.x != obj.item.x / 40 || item.y != obj.item.y / 40);
  if (obj.type == "B" && obj.bomber.name == "aka000") {
    myBombCount++
  }
});

function snapToNearestGrid(pos, size = 40) {
  return {
    x: Math.floor(pos.x / size),
    y: Math.floor(pos.y / size)
  };
}

socket.on("player_move", (obj) => {
  if (obj.name == "aka000") {
    realStart = {x: obj.x, y: obj.y}
    speed = obj.speed
    start = snapToNearestGrid(realStart)
  }
})

function startInDanger(start, bombs, walls, gridSize = 16) {
  const wallSet = new Set(walls.map(w => `${w.x},${w.y}`));
  const sx = start.x, sy = start.y;

  for (const b of bombs) {
    const bx = b.x, by = b.y, r = b.range;
    const dirs = [[1,0], [-1,0], [0,1], [0,-1]];

    // kiểm tra tâm bom
    if (sx === bx && sy === by) return true;

    for (const [dx, dy] of dirs) {
      for (let step = 1; step <= r; step++) {
        const nx = bx + dx * step;
        const ny = by + dy * step;

        // ra ngoài bản đồ
        if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) break;

        if (nx === sx && ny === sy) return true; // start nằm trong vùng nổ

        // nếu gặp tường -> dừng nổ
        if (wallSet.has(`${nx},${ny}`)) break;
      }
    }
  }

  return false; // start an toàn
}

function findNearestSafeCell(start, bombs, walls, gridSize = 16) {
  const wallSet = new Set(walls.map(w => `${w.x},${w.y}`));
  
  // Nếu start là wall thì không đi được
  if (wallSet.has(`${start.x},${start.y}`)) return null;

  // Kiểm tra ô có nguy hiểm do bomb hay không
  function isDanger(x, y) {
    for (const b of bombs) {
      const bx = b.x, by = b.y, r = b.range;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

      if (bx === x && by === y) return true;

      for (const [dx, dy] of dirs) {
        for (let step = 1; step <= r; step++) {
          const nx = bx + dx * step;
          const ny = by + dy * step;

          if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) break;
          if (wallSet.has(`${nx},${ny}`)) break;
          if (nx === x && ny === y) return true;
        }
      }
    }
    return false;
  }

  // BFS để tìm ô an toàn gần start
  const visited = new Set();
  const queue = [{ x: start.x, y: start.y, path: [] }];
  visited.add(`${start.x},${start.y}`);

  const directions = [[1,0], [-1,0], [0,1], [0,-1]];

  while (queue.length > 0) {
    const { x, y, path } = queue.shift();

    if (!isDanger(x, y) && !wallSet.has(`${x},${y}`)) {
      // Tìm bước đầu tiên trong path mà không phải wall
      for (const step of path) {
        if (!wallSet.has(`${step.x},${step.y}`)) return step;
      }
      // Nếu path trống, trả về chính start
      return { x, y };
    }

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;

      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
      if (wallSet.has(key)) continue;
      if (visited.has(key)) continue;

      visited.add(key);
      queue.push({ x: nx, y: ny, path: [...path, { x: nx, y: ny }] });
    }
  }

  return null; // không tìm thấy ô an toàn
}

function findNearestReachableItemv2(start, walls, bombs, items, size = 16) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  const isWall = new Set(walls.map(o => `${o.x},${o.y}`));
  const itemSet = new Set(items.map(o => `${o.x},${o.y}`));

  // Danger zone
  const danger = new Set();
  for (const {x, y, range} of bombs) {
    danger.add(`${x},${y}`);
    for (const [dx, dy] of dirs) {
      for (let i = 1; i <= range; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;

        const key = `${nx},${ny}`;
        danger.add(key);

        if (isWall.has(key)) break;
      }
    }
  }

  
  const queue = [];
  const visited = new Set();
  
  queue.push({x: start.x, y: start.y});
  visited.add(`${start.x},${start.y}`);
  
  while (queue.length > 0) {
    const p = queue.shift();
    const key = `${p.x},${p.y}`;
    console.log("items=", itemSet)
    
    // ✅ FOUND Item có thể đứng
    if (itemSet.has(key) && !danger.has(key)) {
      return { x: p.x, y: p.y }; // 🔥 Trả về object rõ ràng
    }

    for (const [dx, dy] of dirs) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      const nk = `${nx},${ny}`;

      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (isWall.has(nk)) continue;
      if (danger.has(nk)) continue;
      if (visited.has(nk)) continue;

      visited.add(nk);
      queue.push({x: nx, y: ny});
    }
  }

  return null; // ❌ Không item nào reachable
}

function findNearestReachableItem(start, walls, bombs, items, size = 16) {
  const dirs = [
    [1,0,'RIGHT'], [-1,0,'LEFT'],
    [0,1,'DOWN'], [0,-1,'UP']
  ];

  const isWall = new Set(walls.map(o => `${o.x},${o.y}`));
  const itemSet = new Set(items.map(o => `${o.x},${o.y}`));

  // Danger zone
  const danger = new Set();
  for (const {x, y, range} of bombs) {
    danger.add(`${x},${y}`);
    for (const [dx, dy] of dirs) {
      for (let i = 1; i <= range; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
        const key = `${nx},${ny}`;
        danger.add(key);
        if (isWall.has(key)) break;
      }
    }
  }

  const queue = [];
  const visited = new Set();

  queue.push({ x: start.x, y: start.y, first: null });
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const { x, y, first } = queue.shift();
    const key = `${x},${y}`;

    // 🎯 Tìm thấy item reachable
    if (itemSet.has(key) && !danger.has(key)) {
      return first || { x, y }; // Nếu start đang ở item → ở yên
    }

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = `${nx},${ny}`;

      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (isWall.has(nk)) continue;
      if (danger.has(nk)) continue;
      if (visited.has(nk)) continue;

      visited.add(nk);
      queue.push({
        x: nx,
        y: ny,
        first: first || { x: nx, y: ny } // ✅ lưu bước đầu tiên
      });
    }
  }

  return null; // ❌ Không item nào an toàn reachable
}



function getSafeBombPositionv2(start, bombs, walls, newBombRange) {
  const W = 16, H = 16;
  const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Gom walls + bombs thành vật cản
  const bombWalls = bombs.map(b => ({ x: b.x, y: b.y }));
  const obstacles = walls.concat(bombWalls);

  // Lưới đánh dấu chướng ngại
  const obstacle = Array.from({ length: H }, () => Array(W).fill(false));
  for (const w of obstacles) if (inBounds(w.x, w.y)) obstacle[w.y][w.x] = true;

  // Hàm tính vùng nổ 1 quả bom
  function computeExplosionSet(bx, by, r) {
    const explode = Array.from({ length: H }, () => Array(W).fill(false));
    if (!inBounds(bx, by)) return explode;
    explode[by][bx] = true;
    for (const [dx, dy] of dirs) {
      for (let step = 1; step <= r; step++) {
        const nx = bx + dx * step, ny = by + dy * step;
        if (!inBounds(nx, ny)) break;
        if (obstacle[ny][nx]) break; // bom / tường chặn nổ
        explode[ny][nx] = true;
      }
    }
    return explode;
  }

  // Vùng nổ từ tất cả bom hiện có
  const danger = Array.from({ length: H }, () => Array(W).fill(false));
  for (const b of bombs) {
    const e = computeExplosionSet(b.x, b.y, b.range);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (e[y][x]) danger[y][x] = true;
  }

  // BFS tìm vị trí đặt bom hợp lệ
  const seen = Array.from({ length: H }, () => Array(W).fill(false));
  const q = [];

  if (!inBounds(start.x, start.y)) return null;
  if (!obstacle[start.y][start.x] && !danger[start.y][start.x]) {
    q.push({ x: start.x, y: start.y });
    seen[start.y][start.x] = true;
  } else return null;

  while (q.length) {
    const cur = q.shift();
    const { x: cx, y: cy } = cur;

    // Không đặt bom ở vùng nổ của bom hiện có
    if (danger[cy][cx]) continue;

    // Vùng nổ nếu đặt bom ở đây (chỉ dùng để xác định vùng nguy hiểm tạm thời)
    const explosion = computeExplosionSet(cx, cy, newBombRange);

    // BFS kiểm tra đường thoát an toàn (chỉ tránh bom hiện có)
    const seen2 = Array.from({ length: H }, () => Array(W).fill(false));
    const q2 = [{ x: cx, y: cy }];
    seen2[cy][cx] = true;
    let foundSafeEscape = false;

    while (q2.length && !foundSafeEscape) {
      const p = q2.shift();

      // Nếu ô này không trong vùng nổ của bom mới và cũng không bị bom cũ nổ → an toàn thoát được
      if (!danger[p.y][p.x] && !explosion[p.y][p.x]) {
        foundSafeEscape = true;
        break;
      }

      for (const [dx, dy] of dirs) {
        const nx = p.x + dx, ny = p.y + dy;
        if (!inBounds(nx, ny)) continue;
        if (seen2[ny][nx]) continue;
        if (obstacle[ny][nx]) continue;
        if (danger[ny][nx]) continue; // ⛔ Không đi qua vùng nổ bom hiện có
        seen2[ny][nx] = true;
        q2.push({ x: nx, y: ny });
      }
    }

    if (foundSafeEscape) {
      return { x: cx, y: cy }; // ✅ có thể đặt bom & thoát an toàn
    }

    // BFS mở rộng (chỉ qua ô an toàn của bom hiện có)
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      if (seen[ny][nx]) continue;
      if (obstacle[ny][nx]) continue;
      if (danger[ny][nx]) continue; // ⛔ không đi qua vùng nổ bom hiện có
      seen[ny][nx] = true;
      q.push({ x: nx, y: ny });
    }
  }

  // ❌ Không có vị trí nào hợp lệ
  return null;
}

function getSafeBombPosition(start, bombs, walls, newBombRange) {
  const W = 16, H = 16;
  const dirs = [[1,0],[ -1,0],[0,1],[0,-1]];
  const inBounds = (x, y) => x>=0 && x<W && y>=0 && y<H;

  // Gom bomb positions thành vật cản tạm
  const obstacles = new Set(walls.map(w => `${w.x},${w.y}`));
  for (const b of bombs) obstacles.add(`${b.x},${b.y}`);

  // Tính vùng nổ của một bom bất kỳ
  function computeExplosion(bx, by, r) {
    const boom = new Set();
    if (!inBounds(bx, by)) return boom;
    boom.add(`${bx},${by}`);

    for (const [dx, dy] of dirs) {
      for (let step=1; step<=r; step++) {
        const nx = bx + dx*step;
        const ny = by + dy*step;
        if (!inBounds(nx, ny)) break;
        if (obstacles.has(`${nx},${ny}`)) break;
        boom.add(`${nx},${ny}`);
      }
    }
    return boom;
  }

  // Vùng nổ hiện tại từ bom cũ
  const dangerNow = new Set();
  for (const b of bombs) {
    const e = computeExplosion(b.x, b.y, b.range);
    for (const k of e) dangerNow.add(k);
  }

  // BFS tìm vị trí đặt bom hợp lệ
  const q = [start];
  const visited = new Set([`${start.x},${start.y}`]);

  while (q.length) {
    const {x,y} = q.shift();
    const key = `${x},${y}`;

    // Không đặt bom ở vùng nổ bom hiện tại
    if (dangerNow.has(key)) continue;

    // Tính vùng nổ bom mới nếu đặt ở đây
    const newExplosion = computeExplosion(x,y,newBombRange);

    // BFS kiểm tra có thoát được vùng nổ mới không
    const q2 = [{x,y}];
    const seen2 = new Set([key]);
    let escape = false;

    while (q2.length && !escape) {
      const p = q2.shift();
      const k2 = `${p.x},${p.y}`;

      // ✅ Chỉ cần ra khỏi vùng nổ bom mới là an toàn
      if (!newExplosion.has(k2)) {
        escape = true;
        break;
      }

      for (const [dx,dy] of dirs) {
        const nx = p.x+dx, ny = p.y+dy;
        const nk = `${nx},${ny}`;
        if (!inBounds(nx,ny)) continue;
        if (seen2.has(nk)) continue;
        if (obstacles.has(nk)) continue;
        // ⚠ Có thể đi trong vùng dangerNow, miễn là thoát kịp khỏi bom mới
        seen2.add(nk);
        q2.push({x:nx,y:ny});
      }
    }

    if (escape) {
      return {x,y}; // ✅ vị trí đặt bom an toàn
    }

    // BFS tìm tiếp các vị trí đặt bom tiềm năng
    for (const [dx,dy] of dirs) {
      const nx=x+dx, ny=y+dy;
      const nk=`${nx},${ny}`;
      if (!inBounds(nx,ny)) continue;
      if (visited.has(nk)) continue;
      if (obstacles.has(nk)) continue;
      if (dangerNow.has(nk)) continue; // không bước vào vùng nổ bom cũ
      visited.add(nk);
      q.push({x:nx,y:ny});
    }
  }

  return null; // ❌ Không chỗ nào đặt bom mà chạy thoát được
}


async function moveSimple(realStart, b, botSize = 35, cellSize = 40) {
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  // Giới hạn tâm bot để toàn bộ bot nằm trong ô
  const minX = b.x + botSize / 2;           // Mép trái bot ≥ mép trái ô
  const maxX = b.x + cellSize - botSize / 2; // Mép phải bot ≤ mép phải ô
  const minY = b.y + botSize / 2;
  const maxY = b.y + cellSize - botSize / 2;

  // Tâm hiện tại của bot
  let pos = { x: realStart.x + botSize / 2, y: realStart.y + botSize / 2 };

  while (pos.x < minX || pos.x > maxX || pos.y < minY || pos.y > maxY) {
    if (pos.x < minX) {
      socket.emit("move", { orient: "RIGHT" });
      pos.x += speed;
    } else if (pos.x > maxX) {
      socket.emit("move", { orient: "LEFT" });
      pos.x -= speed;
    }

    if (pos.y < minY) {
      socket.emit("move", { orient: "DOWN" });
      pos.y += speed;
    } else if (pos.y > maxY) {
      socket.emit("move", { orient: "UP" });
      pos.y -= speed;
    }

    await sleep(10);
  }

  return true;
}

setInterval(() => {
  inDanger = startInDanger(start, bombs, walls)
}, 17);

setInterval(() => {
  goItem = findNearestReachableItem(start, bombs, walls, items)
}, 10);

setInterval(async () => {
  if (true) {
    let end
    if (goItem) {
      end = goItem
    } else {
      end = findNearestSafeCell(start, bombs, walls)
    }
    if (end && Object.keys(end).length > 0) {
      let endObj = {x: end.x*40, y: end.y*40}
      await moveSimple(realStart, endObj)
    }
  }
}, 17);

setInterval(async () => {
  if (
    start && Object.keys(start).length > 0 &&
    walls && walls.length > 0 &&
    !inDanger
  ) {
    let end
    if (!goItem) {
      end = getSafeBombPosition(start, walls, bombs, range);
      if (end && Object.keys(end).length > 0) {
        let endObj = {x: end.x*40, y: end.y*40}
        let move = false
        move = await moveSimple(realStart, endObj)
        if (move && myBombCount > 0) {
          socket.emit("place_bomb")
          mode = false
        }
      }
    }
  }
}, 17);

