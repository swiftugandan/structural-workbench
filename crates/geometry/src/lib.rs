pub fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    (0..3).map(|i| a[i] * b[i]).sum()
}
pub fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
pub fn axes(a: [f64; 3], b: [f64; 3], hint: [f64; 3]) -> (f64, [[f64; 3]; 3]) {
    let d = std::array::from_fn(|i| b[i] - a[i]);
    let l = dot(d, d).sqrt();
    let x = d.map(|v| v / l);
    let y = std::array::from_fn(|i| hint[i] - dot(x, hint) * x[i]);
    let yl = dot(y, y).sqrt();
    let y = y.map(|v| v / yl);
    (l, [x, y, cross(x, y)])
}
pub fn local(r: [[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    r.map(|a| dot(a, v))
}
pub fn global(r: [[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    std::array::from_fn(|i| (0..3).map(|j| r[j][i] * v[j]).sum())
}
