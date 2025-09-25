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

  // slice uploaded image to 3x3 data URLs
  async function sliceImage(image: HTMLImageElement) {
    const size = 600;
    const c = canvasRef.current!;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    // fit-cover crop
    const arImg = image.width / image.height;
    const s = size;
    let sx = 0,
      sy = 0,
      sw = image.width,
      sh = image.height;
    if (arImg > 1) {
      // wide → crop sides
      sw = image.height;
      sx = (image.width - sw) / 2;
    } else {
      // tall → crop top/bottom
      sh = image.width;
      sy = (image.height - sh) / 2;
    }
    ctx.clearRect(0, 0, s, s);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, s, s);

    const urls: string[] = [];
    for (let r = 0; r < 3; r++)
      for (let c2 = 0; c2 < 3; c2++) {
        const off = document.createElement("canvas");
        off.width = s / 3;
        off.height = s / 3;
        off
          .getContext("2d")!
          .drawImage(
            c,
            c2 * (s / 3),
            r * (s / 3),
            s / 3,
            s / 3,
            0,
            0,
            s / 3,
            s / 3
          );
        urls.push(off.toDataURL());
      }
    // Map tiles 1..8 to first 8 URLs, blank uses a solid color
    const blank = (() => {
      const b = document.createElement("canvas");
      b.width = s / 3;
      b.height = s / 3;
      const bctx = b.getContext("2d")!;
      bctx.fillStyle = "#eee";
      bctx.fillRect(0, 0, s / 3, s / 3);
      bctx.fillStyle = "#666";
      bctx.font = "20px system-ui";
      bctx.textAlign = "center";
      bctx.textBaseline = "middle";
      bctx.fillText(" ", s / 3 / 2, s / 3 / 2);
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
  }, [tiles]);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "2rem auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>8-Puzzle</h1>
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
      </div>

      <div
        style={{
          width: 600,
          height: 600,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
          background: "#ccc",
        }}
      >
        {grid.map((cell) => (
          <div
            key={cell.idx}
            onClick={() => tryMove(cell.idx)}
            style={{
              background:
                cell.v === 0
                  ? "#eee"
                  : `url(${cell.url}) center/cover no-repeat`,
              display: "grid",
              placeItems: "center",
              fontSize: 24,
              color: "#111",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            {cell.v === 0 ? "" : ""}
          </div>
        ))}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
