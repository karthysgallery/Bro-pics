/**
 * Perspective mapping for scene photos. A flat rectangle (the artwork plane)
 * is pinned to the four corners of a quad in the picture, so a frame that was
 * photographed at an angle gets the same foreshortening.
 */
export interface Point {
  x: number;
  y: number;
}

/** Corners clockwise from top-left. */
export type Quad = [Point, Point, Point, Point];

/** Solves A·x = b by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error('Degenerate quad: corners are collinear.');
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r][n];
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c];
    x[r] = sum / m[r][r];
  }
  return x;
}

/**
 * The 3x3 homography [h0..h7, 1] taking the rectangle (0,0)-(w,h) onto `quad`.
 */
export function rectToQuadHomography(width: number, height: number, quad: Quad): number[] {
  const src: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = quad[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solve(a, b);
}

/** Applies a homography from {@link rectToQuadHomography} to a point. */
export function applyHomography(h: number[], x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + 1;
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

/**
 * CSS `matrix3d(...)` value that maps an element of size width x height with
 * `transform-origin: 0 0` onto `quad` (pixel coordinates in its container).
 */
export function quadToMatrix3d(width: number, height: number, quad: Quad): string {
  const [a, b, c, d, e, f, g, h] = rectToQuadHomography(width, height, quad);
  // Column-major 4x4; z is passed through so the element stays flat.
  const m = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((n) => (Math.abs(n) < 1e-10 ? 0 : Number(n.toPrecision(10)))).join(',')})`;
}
