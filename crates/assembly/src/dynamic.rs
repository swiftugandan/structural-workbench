//! The assembled dynamic model shared by modal (dynamics-v1) and harmonic and
//! response-spectrum analysis (response-v1): the stability-v1 mesh, free
//! DOFs with hinge DOFs, stiffness K, declared-mass matrix M, and per-element
//! recovery on the free-DOF vector.

use std::collections::BTreeMap;

use sprs::{CsMat, TriMat};
use workbench_frame::{Matrix, consistent_mass, lumped_mass, stiffness};
use workbench_geometry::axes;
use workbench_model::{Member, Project, Result, err};
use workbench_solver::matvec;

use crate::expand::{SplitMap, expand_point_loads};
use crate::modal::{MassMatrix, Masses, masses};
use crate::stability::{Dofs, Mesh, assemble, dofs, subdivide};

pub(crate) struct DynamicModel {
    /// The canonicalised input project.
    pub original: Project,
    pub model_hash: String,
    pub mesh: Mesh,
    pub splits: SplitMap,
    pub d: Dofs,
    pub mass: Masses,
    pub mass_matrix: MassMatrix,
    pub k: CsMat<f64>,
    pub m: CsMat<f64>,
    /// Rigid unit translation in X, Y, Z on the free DOFs.
    pub influence: Vec<Vec<f64>>,
    /// rᵀ M r per direction (kg).
    pub participating: Vec<f64>,
    pub total_mass: f64,
}

/// One mesh element: geometry, local stiffness and mass, and its 12 element
/// DOFs as combinations of free DOFs (hinge DOFs on released end rotations).
pub(crate) struct DynamicElement {
    pub id: String,
    pub start: usize,
    pub end: usize,
    pub length: f64,
    pub rotation: [[f64; 3]; 3],
    pub stiffness: Matrix,
    pub mass: Matrix,
    pub map: [Vec<(usize, f64)>; 12],
}

impl DynamicModel {
    pub fn build(project: &Project, mass_matrix: MassMatrix, subdivisions: usize) -> Result<Self> {
        project.validate()?;
        let mut original = project.clone();
        original.canonicalise();
        if original.mass_sources.is_empty() {
            return Err(err(
                "NO_MASS",
                "Declare mass sources (self mass, load cases or nodal masses) before a dynamic analysis",
            ));
        }
        let model_hash = original.hash();
        let (expanded, splits) = expand_point_loads(&original)?;
        let mesh = subdivide(&expanded, subdivisions)?;
        let p = &mesh.project;
        let mass = masses(&original, p)?;
        let total_mass: f64 = mass.by_source.iter().map(|s| s.mass).sum();
        if !(total_mass > 0.) {
            return Err(err(
                "NO_MASS",
                "The declared mass sources contribute no mass",
            ));
        }
        let d = dofs(p);
        let k = assemble(p, &d, |m, l| element_stiffness(p, m, l));
        let element_mass = assemble(p, &d, |m, l| element_mass(p, &mass, mass_matrix, m, l));
        let mut nodal = TriMat::new((d.count, d.count));
        for (node, value) in &mass.point {
            for a in 0..3 {
                if let Some(f) = d.free[d.node[node] * 6 + a] {
                    nodal.add_triplet(f, f, *value);
                }
            }
        }
        let nodal: CsMat<f64> = nodal.to_csc();
        let m = &element_mass + &nodal;
        let influence: Vec<Vec<f64>> = (0..3)
            .map(|dir| {
                let mut r = vec![0.; d.count];
                for i in 0..p.nodes.len() {
                    if let Some(f) = d.free[i * 6 + dir] {
                        r[f] = 1.;
                    }
                }
                r
            })
            .collect();
        let participating: Vec<f64> = influence
            .iter()
            .map(|r| r.iter().zip(matvec(&m, r)).map(|(a, b)| a * b).sum())
            .collect();
        if participating.iter().all(|v| *v <= 0.) {
            return Err(err(
                "NO_MASS",
                "All declared mass sits on restrained degrees of freedom",
            ));
        }
        Ok(Self {
            original,
            model_hash,
            mesh,
            splits,
            d,
            mass,
            mass_matrix,
            k,
            m,
            influence,
            participating,
            total_mass,
        })
    }

    pub fn budget(&self) -> usize {
        self.mesh.project.analysis_settings.memory_limit_mi_b as usize * 1024 * 1024 / 2
    }

    /// Every mesh element with its recovery data, in mesh member order.
    pub fn elements(&self) -> Vec<DynamicElement> {
        let p = &self.mesh.project;
        let position: BTreeMap<&str, [f64; 3]> = p
            .nodes
            .iter()
            .map(|x| (x.id.as_str(), x.position))
            .collect();
        p.members
            .iter()
            .map(|m| {
                let (l, r) = axes(
                    position[m.start.as_str()],
                    position[m.end.as_str()],
                    m.local_y,
                );
                let (i, j) = (self.d.node[&m.start], self.d.node[&m.end]);
                DynamicElement {
                    id: m.id.clone(),
                    start: i,
                    end: j,
                    length: l,
                    rotation: r,
                    stiffness: element_stiffness(p, m, l),
                    mass: element_mass(p, &self.mass, self.mass_matrix, m, l),
                    map: crate::stability::element_dofs(&self.d, m, i, j),
                }
            })
            .collect()
    }
}

impl DynamicElement {
    /// Element DOFs in global axes for a free-DOF vector (real or complex
    /// via the closure), zero at restrained DOFs.
    pub fn global<T: Copy + Default + std::ops::Add<Output = T>>(
        &self,
        x: &[T],
        scale: impl Fn(T, f64) -> T,
    ) -> [T; 12] {
        std::array::from_fn(|a| {
            self.map[a]
                .iter()
                .fold(T::default(), |s, &(f, c)| s + scale(x[f], c))
        })
    }
}

pub(crate) fn element_stiffness(p: &Project, m: &Member, l: f64) -> Matrix {
    let material = p.materials.iter().find(|x| x.id == m.material).unwrap();
    let section = p.sections.iter().find(|x| x.id == m.section).unwrap();
    stiffness(l, material, section)
}

pub(crate) fn element_mass(
    p: &Project,
    mass: &Masses,
    kind: MassMatrix,
    m: &Member,
    l: f64,
) -> Matrix {
    let material = p.materials.iter().find(|x| x.id == m.material).unwrap();
    let section = p.sections.iter().find(|x| x.id == m.section).unwrap();
    let own = mass.self_factor.get(&m.id).copied().unwrap_or(0.);
    let mu = own * material.density * section.a + mass.line.get(&m.id).copied().unwrap_or(0.);
    match kind {
        MassMatrix::Consistent => {
            consistent_mass(l, mu, own * material.density * (section.iy + section.iz))
        }
        MassMatrix::Lumped => lumped_mass(l, mu),
    }
}
