# Physical diagram planes

Source change: b745910. Tested source hash: 82c2519747e1df664e03f74e01d2289d4176ac845be8c249dce9c0bade3e1b00. Build: 0021fd965866ed2ea46af92b7b4c5af62892be15001fdb57675619200f61bc79. The content snapshot also includes concurrent guided-input changes; the commit alone does not identify all tested files.

Build and 4 analytical rendering tests pass. 7 focused browser tests pass: shear values/units/staleness, orbit, GPU picking, clipping, depth and DPR. First run had 6 passes and an artifact-directory collision, preserved in browser-first.log/playwright-first.json; isolated-output rerun passed. No full numerical or milestone rerun.

My/Vz offset along member local z; Vy along local y, using Rust frames. Shared model-space peak amplitude preserves physical planes through orbit and foreshortening. Edge-on plots may overlap geometry. Engineering values are unchanged. Live visual review remains pending because browser policy verification was unavailable; required platform acceptance is also outstanding.
