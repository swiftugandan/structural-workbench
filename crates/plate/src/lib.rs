//! Slab panel plate analysis, plate-v1 (M10, `docs/formulations/plate.md`,
//! ADR 0021): structured mesh with one rectangular opening, free / hard-simple
//! / clamped edges, uniform pressure, flat Q4 + MITC4 elements.

pub mod element;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sprs::TriMat;
use workbench_model::{Result, err};
use workbench_solver::{LinearSolver, SparseLdl};

pub use element::{Actions, PlateMaterial};
use element::{DOFS, NODE_DOFS};

/// Most elements a panel may be meshed into.
pub const MAX_ELEMENTS: usize = 40_000;
/// Cell aspect ratio above which the mesh carries a warning.
pub const ASPECT_WARNING: f64 = 5.;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Edge {
    Free,
    Simple,
    Clamped,
}

/// A rectangular panel [0, lx] × [0, ly] with at most one rectangular opening.
#[derive(Clone, Debug)]
pub struct Panel {
    pub lx: f64,
    pub ly: f64,
    /// (x0, x1, y0, y1), strictly inside the panel.
    pub opening: Option<[f64; 4]>,
    /// Edges at x = 0, x = lx, y = 0, y = ly.
    pub edges: [Edge; 4],
    /// Target cell size (m).
    pub target: f64,
}

#[derive(Clone, Debug)]
pub struct Mesh {
    pub xs: Vec<f64>,
    pub ys: Vec<f64>,
    pub nodes: Vec<[f64; 2]>,
    /// Grid index (i, j) of each node.
    pub node_grid: Vec<(usize, usize)>,
    pub elements: Vec<[usize; 4]>,
    /// Grid index (i, j) of each element (its lower-left corner).
    pub element_grid: Vec<(usize, usize)>,
}

fn grid_lines(length: f64, cuts: &[f64], target: f64) -> Vec<f64> {
    let mut breaks = vec![0., length];
    breaks.extend_from_slice(cuts);
    breaks.sort_by(f64::total_cmp);
    breaks.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
    let mut lines = vec![0.];
    for w in breaks.windows(2) {
        let n = ((w[1] - w[0]) / target - 1e-9).ceil().max(1.) as usize;
        for k in 1..=n {
            lines.push(w[0] + (w[1] - w[0]) * k as f64 / n as f64);
        }
    }
    lines
}

impl Panel {
    pub fn validate(&self) -> Result<()> {
        let finite_positive = |v: f64| v.is_finite() && v > 0.;
        if !(finite_positive(self.lx) && finite_positive(self.ly) && finite_positive(self.target)) {
            return Err(err(
                "INVALID_SETTINGS",
                "Panel sizes and mesh size must be positive",
            ));
        }
        if let Some([x0, x1, y0, y1]) = self.opening
            && !(0. < x0 && x0 < x1 && x1 < self.lx && 0. < y0 && y0 < y1 && y1 < self.ly)
        {
            return Err(err(
                "INVALID_SETTINGS",
                "The opening must lie strictly inside the panel",
            ));
        }
        // The plate rigid modes w = a + b x + c y are held by one clamped
        // edge or by any two supported edges; one simple edge leaves the
        // rotation about its own line free. Supported edges hold u and v.
        let clamped = self.edges.iter().filter(|e| **e == Edge::Clamped).count();
        let supported = self.edges.iter().filter(|e| **e != Edge::Free).count();
        if clamped == 0 && supported < 2 {
            return Err(err(
                "UNSTABLE_MODEL",
                "The panel needs one clamped edge or two supported edges; it can rotate about a single simple edge",
            ));
        }
        Ok(())
    }

    /// The structured mesh at the panel's target size.
    pub fn mesh(&self) -> Result<Mesh> {
        self.validate()?;
        let (cx, cy) = match self.opening {
            Some([x0, x1, y0, y1]) => (vec![x0, x1], vec![y0, y1]),
            None => (vec![], vec![]),
        };
        Mesh::structured(
            self,
            grid_lines(self.lx, &cx, self.target),
            grid_lines(self.ly, &cy, self.target),
        )
    }
}

impl Mesh {
    /// A structured mesh on explicit grid lines, which must run from 0 to the
    /// panel size, increase strictly and include the opening edges.
    pub fn structured(panel: &Panel, xs: Vec<f64>, ys: Vec<f64>) -> Result<Mesh> {
        panel.validate()?;
        let spans = |lines: &[f64], length: f64| {
            lines.len() >= 2
                && lines[0] == 0.
                && (lines[lines.len() - 1] - length).abs() <= 1e-12 * length
                && lines.windows(2).all(|w| w[1] > w[0])
        };
        let has = |lines: &[f64], v: f64| lines.iter().any(|l| (l - v).abs() <= 1e-12);
        if !spans(&xs, panel.lx) || !spans(&ys, panel.ly) {
            return Err(err(
                "INVALID_SETTINGS",
                "Grid lines must increase from 0 to the panel size",
            ));
        }
        if let Some([x0, x1, y0, y1]) = panel.opening
            && !(has(&xs, x0) && has(&xs, x1) && has(&ys, y0) && has(&ys, y1))
        {
            return Err(err(
                "INVALID_SETTINGS",
                "Grid lines must include the opening edges",
            ));
        }
        let cells = (xs.len() - 1) * (ys.len() - 1);
        if cells > MAX_ELEMENTS {
            return Err(err(
                "MEMORY_LIMIT",
                format!(
                    "{cells} elements exceed the {MAX_ELEMENTS}-element limit; enlarge the mesh size"
                ),
            ));
        }
        let inside = |x: f64, y: f64| {
            panel
                .opening
                .is_some_and(|[x0, x1, y0, y1]| x0 < x && x < x1 && y0 < y && y < y1)
        };
        let mut element_grid = vec![];
        for j in 0..ys.len() - 1 {
            for i in 0..xs.len() - 1 {
                if !inside((xs[i] + xs[i + 1]) / 2., (ys[j] + ys[j + 1]) / 2.) {
                    element_grid.push((i, j));
                }
            }
        }
        let mut index: BTreeMap<(usize, usize), usize> = BTreeMap::new();
        for &(i, j) in &element_grid {
            for c in [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)] {
                let n = index.len();
                index.entry(c).or_insert(n);
            }
        }
        let mut node_grid = vec![(0, 0); index.len()];
        for (&c, &n) in &index {
            node_grid[n] = c;
        }
        let nodes = node_grid.iter().map(|&(i, j)| [xs[i], ys[j]]).collect();
        let elements = element_grid
            .iter()
            .map(|&(i, j)| {
                [
                    index[&(i, j)],
                    index[&(i + 1, j)],
                    index[&(i + 1, j + 1)],
                    index[&(i, j + 1)],
                ]
            })
            .collect();
        Ok(Mesh {
            xs,
            ys,
            nodes,
            node_grid,
            elements,
            element_grid,
        })
    }

    /// Node index at grid position (i, j), if that node exists.
    pub fn node_at(&self, i: usize, j: usize) -> Option<usize> {
        self.node_grid.iter().position(|&g| g == (i, j))
    }
    /// Element index whose lower-left grid corner is (i, j), if present.
    pub fn element_at(&self, i: usize, j: usize) -> Option<usize> {
        self.element_grid.iter().position(|&g| g == (i, j))
    }
    fn element_xy(&self, e: usize) -> [[f64; 2]; 4] {
        self.elements[e].map(|n| self.nodes[n])
    }
    /// (count, largest cell aspect ratio, smallest cell size).
    pub fn quality(&self) -> (usize, f64, f64) {
        let mut aspect = 1f64;
        let mut smallest = f64::INFINITY;
        for &(i, j) in &self.element_grid {
            let (hx, hy) = (self.xs[i + 1] - self.xs[i], self.ys[j + 1] - self.ys[j]);
            aspect = aspect.max(hx.max(hy) / hx.min(hy));
            smallest = smallest.min(hx.min(hy));
        }
        (self.elements.len(), aspect, smallest)
    }
}

/// Wood–Armer design moments of one element (N m/m, all ≥ 0): bottom X, bottom
/// Y (sagging), top X, top Y (hogging magnitudes).
pub fn wood_armer(mx: f64, my: f64, mxy: f64) -> [f64; 4] {
    let t = mxy.abs();
    let (mut bx, mut by) = (mx + t, my + t);
    if bx < 0. {
        bx = 0.;
        by = if mx != 0. {
            my + (mxy * mxy / mx).abs()
        } else {
            my
        };
    } else if by < 0. {
        by = 0.;
        bx = if my != 0. {
            mx + (mxy * mxy / my).abs()
        } else {
            mx
        };
    }
    let (mut tx, mut ty) = (mx - t, my - t);
    if tx > 0. {
        tx = 0.;
        ty = if mx != 0. {
            my - (mxy * mxy / mx).abs()
        } else {
            my
        };
    } else if ty > 0. {
        ty = 0.;
        tx = if my != 0. {
            mx - (mxy * mxy / my).abs()
        } else {
            mx
        };
    }
    [bx.max(0.), by.max(0.), (-tx).max(0.), (-ty).max(0.)]
}

/// Reaction at one restrained node: [Fz (N, up), Mx, My (N m, about global
/// X and Y)] from K u − f; unrestrained components are zero.
#[derive(Clone, Copy, Debug)]
pub struct Reaction {
    pub node: usize,
    pub force: [f64; 3],
}

/// The bending moment per unit length a clamped edge carries at one node,
/// recovered from the consistent nodal reaction over the node's tributary
/// edge length (sagging positive: mx on x = const edges, my on y = const).
#[derive(Clone, Copy, Debug)]
pub struct EdgeMoment {
    /// 0: x = 0, 1: x = lx, 2: y = 0, 3: y = ly.
    pub edge: usize,
    pub node: usize,
    /// Coordinate along the edge (m).
    pub position: f64,
    pub moment: f64,
}

#[derive(Clone, Debug)]
pub struct Solution {
    pub mesh: Mesh,
    /// Nodal [u, v, w, rx, ry].
    pub displacements: Vec<[f64; NODE_DOFS]>,
    /// Unsmoothed actions at element centres: the design and validation values.
    pub element_actions: Vec<Actions>,
    /// Display-only nodal averages of the adjacent element-centre moments
    /// [mx, my, mxy].
    pub smoothed: Vec<[f64; 3]>,
    pub reactions: Vec<Reaction>,
    /// Line moments along clamped edges.
    pub edge_moments: Vec<EdgeMoment>,
    /// Sum of vertical support reactions (N, positive up).
    pub reaction_z: f64,
    /// Applied pressure resultant (N, positive down).
    pub applied: f64,
    /// |reaction_z − applied| / applied.
    pub balance: f64,
    pub free_dofs: usize,
    pub residual: f64,
}

fn restraints(panel: &Panel, x: f64, y: f64) -> [bool; NODE_DOFS] {
    let mut fixed = [false; NODE_DOFS];
    let on = [
        x.abs() < 1e-12,
        (x - panel.lx).abs() < 1e-12,
        y.abs() < 1e-12,
        (y - panel.ly).abs() < 1e-12,
    ];
    for (k, edge) in panel.edges.iter().enumerate() {
        if !on[k] {
            continue;
        }
        match edge {
            Edge::Free => {}
            Edge::Simple => {
                fixed[0] = true;
                fixed[1] = true;
                fixed[2] = true;
                // Hard support: the slope along the edge is held. Along
                // x = const that is ∂w/∂y (rotation about X); along
                // y = const, ∂w/∂x (rotation about Y).
                if k < 2 {
                    fixed[3] = true;
                } else {
                    fixed[4] = true;
                }
            }
            Edge::Clamped => fixed = [true; NODE_DOFS],
        }
    }
    fixed
}

/// Solves one panel under uniform pressure `q` (Pa, downward).
pub fn solve(panel: &Panel, material: &PlateMaterial, q: f64, budget: usize) -> Result<Solution> {
    solve_mesh(panel, panel.mesh()?, material, q, budget)
}

/// Solves one panel on a given mesh of it.
pub fn solve_mesh(
    panel: &Panel,
    mesh: Mesh,
    material: &PlateMaterial,
    q: f64,
    budget: usize,
) -> Result<Solution> {
    if !(material.e.is_finite() && material.e > 0. && material.t.is_finite() && material.t > 0.)
        || !(material.nu.is_finite() && (0. ..0.5).contains(&material.nu))
        || !q.is_finite()
    {
        return Err(err(
            "INVALID_SETTINGS",
            "E and t must be positive, 0 ≤ ν < 0.5 and q finite",
        ));
    }
    let n = mesh.nodes.len();
    let mut free = vec![None; n * NODE_DOFS];
    let mut count = 0;
    for (k, &[x, y]) in mesh.nodes.iter().enumerate() {
        let fixed = restraints(panel, x, y);
        for a in 0..NODE_DOFS {
            if !fixed[a] {
                free[k * NODE_DOFS + a] = Some(count);
                count += 1;
            }
        }
    }
    let ids = |e: usize| -> [usize; DOFS] {
        std::array::from_fn(|x| mesh.elements[e][x / NODE_DOFS] * NODE_DOFS + x % NODE_DOFS)
    };
    // Upper triangle accumulated once, mirrored on insertion: the assembled
    // matrix is exactly symmetric whatever the summation order.
    let mut upper: BTreeMap<(usize, usize), f64> = BTreeMap::new();
    let mut f_full = vec![0.; n * NODE_DOFS];
    let mut stiffness = Vec::with_capacity(mesh.elements.len());
    for e in 0..mesh.elements.len() {
        let xy = mesh.element_xy(e);
        let k = element::stiffness(&xy, material);
        let fe = element::pressure_load(&xy, q);
        let g = ids(e);
        for x in 0..DOFS {
            f_full[g[x]] += fe[x];
            let Some(a) = free[g[x]] else { continue };
            for y in 0..DOFS {
                if let Some(b) = free[g[y]]
                    && a <= b
                    && k[x][y] != 0.
                {
                    *upper.entry((a, b)).or_default() += k[x][y];
                }
            }
        }
        stiffness.push(k);
    }
    let mut t = TriMat::with_capacity((count, count), 2 * upper.len());
    for (&(a, b), &v) in &upper {
        t.add_triplet(a, b, v);
        if a != b {
            t.add_triplet(b, a, v);
        }
    }
    let mut rhs = vec![0.; count];
    for (g, a) in free.iter().enumerate() {
        if let Some(a) = a {
            rhs[*a] = f_full[g];
        }
    }
    let solved = SparseLdl.solve(&t.to_csc(), &rhs, budget)?;
    let mut u = vec![0.; n * NODE_DOFS];
    for (g, a) in free.iter().enumerate() {
        if let Some(a) = a {
            u[g] = solved.values[*a];
        }
    }
    workbench_model::finite(&u)?;
    // Reactions: K u − f at restrained DOFs.
    let mut internal = vec![0.; n * NODE_DOFS];
    let mut element_actions = Vec::with_capacity(mesh.elements.len());
    for (e, k) in stiffness.iter().enumerate() {
        let g = ids(e);
        let d: [f64; DOFS] = std::array::from_fn(|x| u[g[x]]);
        for x in 0..DOFS {
            internal[g[x]] += (0..DOFS).map(|y| k[x][y] * d[y]).sum::<f64>();
        }
        element_actions.push(element::actions(&mesh.element_xy(e), material, &d, 0., 0.));
    }
    let reaction = |g: usize| {
        if free[g].is_none() {
            internal[g] - f_full[g]
        } else {
            0.
        }
    };
    let reactions: Vec<Reaction> = (0..n)
        .filter(|k| (2..NODE_DOFS).any(|a| free[k * NODE_DOFS + a].is_none()))
        .map(|k| Reaction {
            node: k,
            force: [2, 3, 4].map(|a| reaction(k * NODE_DOFS + a)),
        })
        .collect();
    let reaction_z: f64 = reactions.iter().map(|r| r.force[0]).sum();
    let applied: f64 = -f_full.iter().skip(2).step_by(NODE_DOFS).sum::<f64>();
    let edge_moments = edge_moments(panel, &mesh, &reactions);
    let mut sums = vec![[0.; 3]; n];
    let mut counts = vec![0usize; n];
    for (e, a) in element_actions.iter().enumerate() {
        for &k in &mesh.elements[e] {
            sums[k][0] += a.mx;
            sums[k][1] += a.my;
            sums[k][2] += a.mxy;
            counts[k] += 1;
        }
    }
    let smoothed = sums
        .iter()
        .zip(&counts)
        .map(|(s, &c)| s.map(|v| v / c as f64))
        .collect();
    let displacements = (0..n)
        .map(|k| std::array::from_fn(|a| u[k * NODE_DOFS + a]))
        .collect();
    let balance = if applied != 0. {
        (reaction_z - applied).abs() / applied.abs()
    } else {
        reaction_z.abs()
    };
    if !(balance <= 1e-8) {
        return Err(err(
            "RESIDUAL_FAILURE",
            format!("Support reactions differ from the applied load by {balance:e} (relative)"),
        ));
    }
    Ok(Solution {
        reactions,
        edge_moments,
        mesh,
        displacements,
        element_actions,
        smoothed,
        reaction_z,
        applied,
        balance,
        free_dofs: count,
        residual: solved.residual,
    })
}

/// Line moments on clamped edges from the nodal reaction moments. Virtual
/// work on the edge strip gives R_ry = ±mx L on x = const edges and
/// R_rx = ∓my L on y = const edges (L the tributary length), the sign set by
/// the edge's outward normal.
fn edge_moments(panel: &Panel, mesh: &Mesh, reactions: &[Reaction]) -> Vec<EdgeMoment> {
    let (nx, ny) = (mesh.xs.len() - 1, mesh.ys.len() - 1);
    let tributary = |lines: &[f64], k: usize| {
        let before = if k > 0 { lines[k] - lines[k - 1] } else { 0. };
        let after = if k + 1 < lines.len() {
            lines[k + 1] - lines[k]
        } else {
            0.
        };
        (before + after) / 2.
    };
    let mut out = vec![];
    for r in reactions {
        let (i, j) = mesh.node_grid[r.node];
        let [_, rx, ry] = r.force;
        for (edge, on) in [(0, i == 0), (1, i == nx), (2, j == 0), (3, j == ny)] {
            if !on || panel.edges[edge] != Edge::Clamped {
                continue;
            }
            let (position, moment) = match edge {
                0 => (mesh.ys[j], ry / tributary(&mesh.ys, j)),
                1 => (mesh.ys[j], -ry / tributary(&mesh.ys, j)),
                2 => (mesh.xs[i], -rx / tributary(&mesh.xs, i)),
                _ => (mesh.xs[i], rx / tributary(&mesh.xs, i)),
            };
            out.push(EdgeMoment {
                edge,
                node: r.node,
                position,
                moment,
            });
        }
    }
    out
}

/// Extremes of one solution used by the convergence indicator.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Extremes {
    pub max_deflection: f64,
    pub max_mx: f64,
    pub max_my: f64,
    pub min_mx: f64,
    pub min_my: f64,
}

impl Solution {
    /// Extremes of |w| and of the unsmoothed element-centre moments.
    pub fn extremes(&self) -> Extremes {
        let fold = |f: fn(&Actions) -> f64, pick: fn(f64, f64) -> f64, start: f64| {
            self.element_actions.iter().map(f).fold(start, pick)
        };
        Extremes {
            max_deflection: self
                .displacements
                .iter()
                .map(|d| d[2].abs())
                .fold(0., f64::max),
            max_mx: fold(|a| a.mx, f64::max, f64::NEG_INFINITY),
            max_my: fold(|a| a.my, f64::max, f64::NEG_INFINITY),
            min_mx: fold(|a| a.mx, f64::min, f64::INFINITY),
            min_my: fold(|a| a.my, f64::min, f64::INFINITY),
        }
    }
}

/// Mesh-convergence indicator: the panel re-solved at twice the target size
/// and the change of each extreme relative to the fine solution's scale.
#[derive(Clone, Copy, Debug)]
pub struct Convergence {
    pub coarse: Extremes,
    pub coarse_elements: usize,
    /// Largest relative change over the five extremes.
    pub change: f64,
}

/// Re-solves `panel` at twice its target size and compares the extremes with
/// `fine`. Moments are compared on the fine solution's largest moment
/// magnitude so that a near-zero extreme does not dominate. An indicator, not
/// a proof of convergence.
pub fn convergence(
    panel: &Panel,
    material: &PlateMaterial,
    q: f64,
    fine: &Solution,
    budget: usize,
) -> Result<Convergence> {
    let coarse_panel = Panel {
        target: 2. * panel.target,
        ..panel.clone()
    };
    let coarse = solve(&coarse_panel, material, q, budget)?;
    let (a, b) = (coarse.extremes(), fine.extremes());
    let moment_scale = [b.max_mx, b.max_my, b.min_mx, b.min_my]
        .iter()
        .fold(0f64, |m, v| m.max(v.abs()));
    let rel = |x: f64, y: f64, scale: f64| {
        if scale > 0. {
            (x - y).abs() / scale
        } else {
            0.
        }
    };
    let change = [
        rel(a.max_deflection, b.max_deflection, b.max_deflection),
        rel(a.max_mx, b.max_mx, moment_scale),
        rel(a.max_my, b.max_my, moment_scale),
        rel(a.min_mx, b.min_mx, moment_scale),
        rel(a.min_my, b.min_my, moment_scale),
    ]
    .into_iter()
    .fold(0., f64::max);
    Ok(Convergence {
        coarse: a,
        coarse_elements: coarse.mesh.elements.len(),
        change,
    })
}
