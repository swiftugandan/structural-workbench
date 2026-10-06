//! M13 steel connections under ANSI/AISC 360-22 LRFD (ADR 0030): the
//! single-plate shear connection, with an instantaneous-centre bolt group
//! solver and the J3 bolt tables.

pub mod bolts;
pub mod icr;
pub mod single_plate;

#[cfg(test)]
mod tests;

pub use bolts::{Bolt, BoltGroup};
pub use single_plate::{
    Beam, ConnectionActions, SinglePlate, SinglePlateDesign, Support, SupportKind, design,
};
