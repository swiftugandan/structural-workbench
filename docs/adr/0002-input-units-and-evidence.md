# Input units and evidence scope

Interactive command numeric values may be unit-suffixed strings. The Rust command
reducer parses the allowlisted dimension and normalises to SI before validation
or commit. Exported/imported project records remain strict numerical SI under the
unchanged ProjectV1 schema. Bare inspector values receive their displayed unit
suffix in the UI; conversion occurs only in Rust. Invalid dimensional input fails
atomically. Numerical form drafts are marked unapplied and disable solve/report
until committed, distinguishing preview from the authoritative model.

Source digests cover crates, web, contracts, tools (except installed environments),
tests, fixtures, lockfiles and build/configuration inputs. They intentionally
exclude evidence, delivery state and documentation to prevent recursive hashes.
A changed input invalidates evidence. Native and WASM binaries embed that digest.
The original fixture expectations and package manifest remain untouched.
