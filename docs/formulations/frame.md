# Linear spatial frame formulation, mechanics-v1

Domain: straight prismatic isotropic Euler–Bernoulli members, small rotations,
principal bending axes, Saint Venant torsion; no shear deformation or warping.
SI authoritative f64. DOFs: ux uy uz rx ry rz at i, then at j.
Global Z up. Local x = normalised j-i, y = projected supplied localY,
z = x cross y. R has those axes as rows; T = diag(R,R,R,R).

From axial and torsional strain energy, the [0,6] and [3,9] blocks are
EA/L and GJ/L times [[1,-1],[-1,1]], G=E/(2(1+nu)). Integration of
cubic Hermite curvature gives the [1,5,7,11] block
EIz/L^3 [[12,6L,-12,6L],[6L,4L²,-6L,2L²],[-12,-6L,12,-6L],[6L,2L²,-6L,4L²]].
The [2,4,8,10] block uses EIy and flips row/column signs for rotations
because w'=-ry. All other entries of the full 12x12 matrix are zero.
This block specification explicitly defines all 144 entries.
Kglobal=T^t Klocal T. Uniform axial load has qL/2 at each end.
Uniform y load: [qL/2,qL²/12,qL/2,-qL²/12] in its bending block;
z load reverses rotational signs. Self weight is rho A g once.

Restraints use exact partitioning Kff uf=Ff-Kfc uc. Sparse CSC matrix
uses diagonal scaling Sii=1/sqrt(Kii), reverse Cuthill McKee ordering
through sprs-ldl, LDLt, positive pivot checks and scaled residual.
No stabilising springs or pseudoinverse. Worst-case factor storage is
bounded before allocation; actual supported capacity remains experimental.

q=Klocal dlocal-feq is the action applied by the node to the element.
Section action is on the positive cut face of the left segment:
N=-q0-qx*x, Vy=-q1-qy*x, Vz=-q2-qz*x,
T=-q3, My=-q4-q2*x-qz*x²/2, Mz=-q5+q1*x+qy*x²/2.
Deflections use Hermite interpolation plus the uniform-load particular
solution q*x²*(L-x)²/(24EI); thus fixed-fixed loaded interiors are nonzero.
Independent expected values are frozen handoff B01–B11 analytical fixtures.
Released ends and interior point actions are initially rejected explicitly;
no substitute loading or invented design compliance is allowed.
