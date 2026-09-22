# Forces and moments inspector

Source change c1c1351. Source hash 0ac0f7f52090cc0a5e9d0e844db3405f43c0918b9fac46e048ffa13ce80bbae5; build b6b1116beddc33fe8ad3f49c976fce8f5d059e94d7c775fc9ec9c522a290d608.

Build, 4 targeted browser checks and 1 analytical unit check pass. Browser verifies selected member diagram, stations, units, canvas node selection with connected-member force sign, stale withholding and existing property/workspace accessibility. Unit verifies combination load factors, support reaction retrieval and rotated local-to-global member-on-node transformation. First browser run exposed tiny residual display noise; fixed with display-only 1e-9 SI zero tolerance and rerun passed.

Member diagrams are unfolded local section plots, not a camera projection. Station slider selects recovered samples, with physical distance shown. Node diagrams are schematic separate contributions, not scaled vector lengths. Numerical member-end tables explicitly use node-on-member convention; node contributions use member-on-node convention. Missing/current-frame requirements are explicit. Live visual acceptance and full milestone acceptance remain pending.
