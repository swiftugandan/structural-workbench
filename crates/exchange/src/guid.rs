//! IfcGloballyUniqueId: 128 bits in the 22-character IFC base-64 form, and
//! the reversible mapping between GUIDs and project entity IDs.
use sha2::{Digest, Sha256};

const ALPHABET: &[u8; 64] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/// First byte in two characters, then the remaining 15 bytes in groups of
/// three, four characters each.
pub fn encode(bytes: [u8; 16]) -> String {
    let mut out = String::with_capacity(22);
    let first = bytes[0] as u32;
    out.push(ALPHABET[(first >> 6) as usize] as char);
    out.push(ALPHABET[(first & 63) as usize] as char);
    for c in bytes[1..].chunks(3) {
        let n = (c[0] as u32) << 16 | (c[1] as u32) << 8 | c[2] as u32;
        for k in (0..4).rev() {
            out.push(ALPHABET[((n >> (6 * k)) & 63) as usize] as char);
        }
    }
    out
}

pub fn decode(s: &str) -> Option<[u8; 16]> {
    let v: Vec<u32> = s
        .bytes()
        .map(|b| ALPHABET.iter().position(|&a| a == b).map(|p| p as u32))
        .collect::<Option<_>>()?;
    if v.len() != 22 || v[0] > 3 {
        return None;
    }
    let mut out = [0u8; 16];
    out[0] = (v[0] << 6 | v[1]) as u8;
    for (k, c) in v[2..].chunks(4).enumerate() {
        let n = c[0] << 18 | c[1] << 12 | c[2] << 6 | c[3];
        out[1 + 3 * k] = (n >> 16) as u8;
        out[2 + 3 * k] = (n >> 8) as u8;
        out[3 + 3 * k] = n as u8;
    }
    Some(out)
}

pub fn is_valid(s: &str) -> bool {
    decode(s).is_some_and(|b| encode(b) == s)
}

/// A deterministic GUID for an entity that has none: SHA-256 of the scope and
/// entity ID, shaped as an RFC 4122 version 5 style UUID.
pub fn derive(scope: &str, id: &str) -> String {
    let d = Sha256::digest(format!("workbench-exchange-v1\0{scope}\0{id}").as_bytes());
    let mut b = [0u8; 16];
    b.copy_from_slice(&d[..16]);
    b[6] = (b[6] & 0x0f) | 0x50;
    b[8] = (b[8] & 0x3f) | 0x80;
    encode(b)
}

/// Project entity ID for an imported GUID: `g` + the GUID with `$` as `-`
/// (the ID alphabet has no `$`; the GUID alphabet has no `-`).
pub fn to_entity_id(guid: &str) -> String {
    format!("g{}", guid.replace('$', "-"))
}

/// The GUID an entity ID carries, if it was imported from one.
pub fn from_entity_id(id: &str) -> Option<String> {
    let g = id.strip_prefix('g')?.replace('-', "$");
    is_valid(&g).then_some(g)
}

/// The GUID to write for an entity: the one it was imported with, or a
/// derived one.
pub fn for_entity(scope: &str, id: &str) -> String {
    from_entity_id(id).unwrap_or_else(|| derive(scope, id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buildingsmart_example_encodes() {
        // IfcGloballyUniqueId documentation example.
        let hex = "f70dd363bfe3495d84a02c02dcb7d4d2";
        let mut b = [0u8; 16];
        for k in 0..16 {
            b[k] = u8::from_str_radix(&hex[2 * k..2 * k + 2], 16).unwrap();
        }
        assert_eq!(encode(b), "3t3TDZl_D9NOIWB0BSjzJI");
        assert_eq!(decode("3t3TDZl_D9NOIWB0BSjzJI"), Some(b));
    }

    #[test]
    fn entity_ids_round_trip_guids() {
        for g in [
            "3t3TDZl_D9NOIWB0BSjzJI",
            "0$$$$$$$$$$$$$$$$$$$$$",
            derive("p", "m1").as_str(),
        ] {
            assert!(is_valid(g));
            let id = to_entity_id(g);
            assert!(
                id.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            );
            assert_eq!(from_entity_id(&id).as_deref(), Some(g));
            assert_eq!(for_entity("p", &id), g);
        }
        assert_eq!(from_entity_id("m1"), None);
        assert_eq!(for_entity("p", "m1"), derive("p", "m1"));
        assert_ne!(derive("p", "m1"), derive("q", "m1"));
        assert!(!is_valid("4t3TDZl_D9NOIWB0BSjzJI"));
    }
}
