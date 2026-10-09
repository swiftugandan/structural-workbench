# Member action heatmap — screenshots

**Results → Member heatmap** colours each member along its length by
|N|, |Vy|, |Vz|, |My|, |Mz| or |T|. The scale runs from zero up to the
largest value in the model, the same global peak the signed diagrams
use. The heatmap is display only.

| # | Screen | Shows |
| --- | --- | --- |
| 1 | [`01-warehouse-my-full.png`](screens/01-warehouse-my-full.png) | Whole workspace: picker set to *Member heatmap · \|My\|*, legend, results dock |
| 2 | [`02-warehouse-my.png`](screens/02-warehouse-my.png) | W01 3D warehouse, \|My\|: peak 25.22 kN·m |
| 3 | [`03-warehouse-n.png`](screens/03-warehouse-n.png) | W01, \|N\|: interior columns carry the most axial force (peak 31.55 kN) |
| 4 | [`04-warehouse-my-diagram.png`](screens/04-warehouse-my-diagram.png) | Same case, existing signed My diagram, for comparison (same 25.22 kN·m peak) |
| 5 | [`05-portal-my.png`](screens/05-portal-my.png) | S02 asymmetric portal, \|My\|: darkest at the base of the short column (18.17 kN·m) |
| 6 | [`06-cantilever-my.png`](screens/06-cantilever-my.png) | B03 cantilever, \|My\|: dark at the fixed end (20 kN·m), fading to zero at the tip |
| 7 | [`07-cantilever-my-selected.png`](screens/07-cantilever-my-selected.png) | Same, with m1 selected: the selection halo frames the band without hiding it |

## How they were captured

- Source: branch `feat/member-heatmap`. Static build `a6fe22e076a5502a9f4bf3fda8d6b0ce6c4d8c0fe89645be8d4bed682b9e65d6` (shown as "Build a6fe22e076a5" in screen 1).
- Browser: Chrome for Testing 153.0.8010.12 (Playwright `chromium` channel), **headed** under Xvfb (1600×1000×24). Viewport 1440×900.
- WebGPU: SwiftShader through Vulkan, with
  `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --use-angle=swiftshader`.
  This is a software GPU, not hardware, so it does not satisfy the real-GPU platform gate.
- Each model was analysed with its own default case. Screens 2–6 have no selection.

The repository's default headless SwiftShader setup (`--use-angle=swiftshader`) cannot share the WebGPU canvas on this Linux host: the GPU process logs `SharedImageStub: Unable to create shared image` and the device is lost about 2 s after a model opens. That affects `main` too. The headed Vulkan setup above avoids it.
