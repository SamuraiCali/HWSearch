import { useEffect, useMemo, useRef, useState } from "react";

// ----- 8-puzzle core -----
// State is length-9 array with 0=blank, goal = [1,2,3,4,5,6,7,8,0]
type State = number[];

const GOAL: State = [1, 2, 3, 4, 5, 6, 7, 8, 0];
const pos = (s: State, v: number) => s.indexOf(v);
const manhattan = (s: State) => {
  let d = 0;
  for (let v = 1; v <= 8; v++) {
    const i = pos(s, v),
      gi = v - 1;
    d +=
      Math.abs(Math.floor(i / 3) - Math.floor(gi / 3)) +
      Math.abs((i % 3) - (gi % 3));
  }
  return d;
};
const neighbors = (s: State) => {
  const z = pos(s, 0),
    r = Math.floor(z / 3),
    c = z % 3;
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const out: State[] = [];
  for (const [dr, dc] of deltas) {
    const nr = r + dr,
      nc = c + dc;
    if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
    const nz = nr * 3 + nc;
    const t = s.slice();
    [t[z], t[nz]] = [t[nz], t[z]];
    out.push(t);
  }
  return out;
};
const key = (s: State) => s.join(",");
const inversions = (s: State) => {
  const a = s.filter((x) => x !== 0);
  let inv = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inv++;
  return inv;
};
const isSolvable = (s: State) => inversions(s) % 2 === 0;

function shuffleSolvable(): State {
  const a = GOAL.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (!isSolvable(a)) {
    // fix parity by swapping two non-zero tiles
    const i = a.indexOf(1),
      j = a.indexOf(2);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A* for optimal solution (Manhattan is admissible and consistent)
function aStar(start: State): State[] | null {
  if (key(start) === key(GOAL)) return [];
  const h0 = manhattan(start);
  type Node = { f: number; g: number; s: State };
  const open: Node[] = [{ f: h0, g: 0, s: start }];
  const parent = new Map<string, string | null>();
  const gbest = new Map<string, number>();
  parent.set(key(start), null);
  gbest.set(key(start), 0);

  const popMin = () => {
    let mi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[mi].f) mi = i;
    return open.splice(mi, 1)[0];
  };

  while (open.length) {
    const { g, s } = popMin();
    if (key(s) === key(GOAL)) {
      // reconstruct
      const path: State[] = [];
      let cur = key(s);
      while (parent.get(cur)) {
        path.push(cur.split(",").map(Number));
        cur = parent.get(cur)!;
      }
      return path.reverse();
    }
    for (const n of neighbors(s)) {
      const ng = g + 1;
      const nk = key(n);
      if (!gbest.has(nk) || ng < gbest.get(nk)!) {
        gbest.set(nk, ng);
        parent.set(nk, key(s));
        const nf = ng + manhattan(n);
        open.push({ f: nf, g: ng, s: n });
      }
    }
  }
  return null;
}

// ----- UI -----
export default function App() {
  const [tiles, setTiles] = useState<string[] | null>(null); // data URLs for 1..8, last blank
  const [state, setState] = useState<State>(GOAL);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const PORTFOLIO = Array.from(
    { length: 12 },
    (_, i) => `/photos/img${i + 1}.jpg`
  );

  // Uses a random photo for users to try and solve
  async function loadRandomPhoto() {
    const src = PORTFOLIO[Math.floor(Math.random() * PORTFOLIO.length)];
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => sliceImage(im);
    im.src = src;
  }
  // slice uploaded image to 3x3 data URLs
  async function sliceImage(image: HTMLImageElement) {
    const size = 600; // puzzle canvas size
    const c = canvasRef.current!;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;

    // 1) Letterbox background
    ctx.fillStyle = "#f4f4f6"; // padding color
    ctx.fillRect(0, 0, size, size);

    // 2) Fit image fully inside square (contain)
    const ar = image.width / image.height;
    let dw: number, dh: number, dx: number, dy: number;
    if (ar >= 1) {
      // wide image
      dw = size;
      dh = Math.round(size / ar);
      dx = 0;
      dy = Math.round((size - dh) / 2);
    } else {
      // tall image
      dh = size;
      dw = Math.round(size * ar);
      dy = 0;
      dx = Math.round((size - dw) / 2);
    }
    ctx.drawImage(image, 0, 0, image.width, image.height, dx, dy, dw, dh);

    // 3) Slice into 3×3 tiles
    const N = 3,
      tile = size / N,
      urls: string[] = [];
    // small overlap avoids seam lines between tiles
    const pad = 0.5;
    for (let r = 0; r < N; r++) {
      for (let col = 0; col < N; col++) {
        const off = document.createElement("canvas");
        off.width = tile;
        off.height = tile;
        off
          .getContext("2d")!
          .drawImage(
            c,
            col * tile - pad,
            r * tile - pad,
            tile + 2 * pad,
            tile + 2 * pad,
            0,
            0,
            tile,
            tile
          );
        urls.push(off.toDataURL());
      }
    }

    // 4) Map tiles 1..8, create blank for 0
    const blank = (() => {
      const b = document.createElement("canvas");
      b.width = tile;
      b.height = tile;
      const bctx = b.getContext("2d")!;
      bctx.fillStyle = "#f4f4f6";
      bctx.fillRect(0, 0, tile, tile);
      return b.toDataURL();
    })();
    setTiles([...urls.slice(0, 8), blank]);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      sliceImage(im);
    };
    im.src = url;
  }

  function doShuffle() {
    const s = shuffleSolvable();
    setState(s);
  }

  async function doSolve() {
    setBusy(true);
    const path = aStar(state);
    if (!path) {
      setBusy(false);
      return;
    }
    // animate
    for (const st of path) {
      setState(st);
      await new Promise((r) => setTimeout(r, 250));
    }
    setBusy(false);
  }

  // click to move if neighbor of blank
  function tryMove(i: number) {
    if (busy) return;
    const z = state.indexOf(0);
    const zr = Math.floor(z / 3),
      zc = z % 3,
      ir = Math.floor(i / 3),
      ic = i % 3;
    if (Math.abs(zr - ir) + Math.abs(zc - ic) !== 1) return;
    const s = state.slice();
    [s[z], s[i]] = [s[i], s[z]];
    setState(s);
  }

  const grid = useMemo(
    () =>
      state.map((v, idx) => {
        const r = Math.floor(idx / 3),
          c = idx % 3;
        const url = tiles ? tiles[v === 0 ? 8 : v - 1] : undefined;
        return { v, idx, r, c, url };
      }),
    [state, tiles]
  );

  useEffect(() => {
    if (!tiles) setState(GOAL);
    {
      loadRandomPhoto();
    }
  }, [tiles]);

  return (
    <div className="page">
      <main className="container">
        <div
          style={{
            maxWidth: 720,
            margin: "2rem auto",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1>8-Puzzle</h1>
          <fieldset role="group">
            <input type="file" accept="image/*" onChange={onFile} />
            <div style={{ margin: "1rem 0", display: "flex", gap: 8 }}>
              <button onClick={doShuffle} disabled={!tiles}>
                Shuffle
              </button>
              <button onClick={doSolve} disabled={!tiles || busy}>
                Solve optimally
              </button>
              <button onClick={() => setState(GOAL)} disabled={!tiles || busy}>
                Reset
              </button>
              <button onClick={loadRandomPhoto} disabled={busy}>
                Random photo
              </button>
            </div>
          </fieldset>

          <div className="grid">
            <section>
              <div className="puzzle">
                {grid.map((cell) => (
                  <div
                    key={cell.idx}
                    className="puzzle-tile"
                    onClick={() => tryMove(cell.idx)}
                    style={{
                      background:
                        cell.v === 0
                          ? "var(--muted-color)"
                          : `url(${cell.url}) center/cover no-repeat`,
                    }}
                  />
                ))}
              </div>
            </section>
          </div>

          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      </main>
    </div>
  );
}
