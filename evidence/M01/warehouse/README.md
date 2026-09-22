# Warehouse example validation

Source change: 802d7b0. Source hash: 4afd6b08c7b352c06aac10afc59da1c4cdcb9b5466423e2461a267bd2de83822. Build hash: f777b1bb29e225e8033f4c3df90c727f2fc9e1a20c40f730983b5f2f179f4e35. W01 fixture SHA-256: c34f12f5210af5dcd04eb61ebdd4f08bff4001616d6b2e43f4adabd8725659cf.

20 nodes, 25 rigid-jointed members, 8 fixed bases. 12 × 18 m plan, three 6 m bays, 6 m eaves, 8 m ridge. Synthetic steel properties and combined nodal demonstration loads. No self-weight, stability/code-design or connection design claim.

Build PASS; example-browser journey PASS. Native/OpenSees: 468 comparisons PASS (120 displacement/rotation, 48 reaction, 300 member-end-action values). Native/WASM: same 468 values PASS. Six independently summed force/moment equilibrium components PASS within 0.001 N or N m. Oracle tolerances: displacement 1e-9 m/rotation 1e-10 rad plus 1e-4 relative, reactions/end actions 1e-3 plus 1e-4 relative. See validate.mjs for exact WASM tolerances and raw output in numerical-results.json.

Applied Fz −180 kN/Fy +45 kN; reactions +180 kN/−45 kN. Maximum nodal translation magnitude 8.79754 mm. Scaled solver residual 8.156895249364065e-17.

Open Worked examples → 3D warehouse frame, then Analyse. This validates linear-elastic model calculations, not a buildable warehouse design. Full milestone and live visual acceptance remain pending.
