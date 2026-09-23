//! Unit helpers for AISC fixture reconstitution (US customary ↔ SI).

pub const IN_TO_M: f64 = 0.0254;
pub const FT_TO_M: f64 = 0.3048;
pub const KIP_TO_N: f64 = 4_448.221_615_260_5;
pub const KSI_TO_PA: f64 = 6.894_757_293_168_361e6;
pub const KIP_FT_TO_NM: f64 = KIP_TO_N * FT_TO_M;

#[cfg(test)]
pub fn in_to_m(v: f64) -> f64 {
    v * IN_TO_M
}

#[cfg(test)]
pub fn ft_to_m(v: f64) -> f64 {
    v * FT_TO_M
}

#[cfg(test)]
pub fn in2_to_m2(v: f64) -> f64 {
    v * IN_TO_M * IN_TO_M
}

#[cfg(test)]
pub fn in3_to_m3(v: f64) -> f64 {
    v * IN_TO_M.powi(3)
}

#[cfg(test)]
pub fn kip_to_n(v: f64) -> f64 {
    v * KIP_TO_N
}

#[cfg(test)]
pub fn ksi_to_pa(v: f64) -> f64 {
    v * KSI_TO_PA
}

#[cfg(test)]
pub fn kip_ft_to_nm(v: f64) -> f64 {
    v * KIP_FT_TO_NM
}

#[cfg(test)]
pub fn n_to_kip(v: f64) -> f64 {
    v / KIP_TO_N
}

#[cfg(test)]
pub fn nm_to_kip_ft(v: f64) -> f64 {
    v / KIP_FT_TO_NM
}

#[cfg(test)]
pub fn pa_to_ksi(v: f64) -> f64 {
    v / KSI_TO_PA
}
