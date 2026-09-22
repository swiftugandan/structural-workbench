# Physical effect directions

Change commit: 633ee16. Tested snapshot source hash: 6bc6d65e163307b6b8b0bba649889af695dd17c700141dd8423d4f9545467ae4; build hash: 47a68365a3d9148032afda2783cd5924c44c86ab6ba334a17b9c6dba9dea9014. Snapshot includes concurrent guided-input work.

Build, 5 rendering unit tests and 8 targeted browser tests pass. Covers local action planes, pure-Z and coupled global deformation, camera depth, zero scale, portal solve/edit/undo/persistence, shear/staleness and graphics. No full numerical/milestone rerun.

Vy uses local y, Vz and My local z. Deformation uses all global displacement components with user scale before projection and retains physical depth. Combined effects are spatial. Live visual review and required platform acceptance remain pending.
