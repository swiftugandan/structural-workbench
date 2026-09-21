# 3D orientation refinement

Source revision: a9ee71e72ea3c55752dde8c35af1e0d194591a99
Source hash: 0b2ab50e4d1d95cfb09489a4e6d48a458d5098a7f9b0478fa870364194354195
Build hash: 640e141ed0a81f2c5ca39aed22aeee89870c7a4ea98ff7fe4b2676f498c26020

Build PASS. 14 targeted browser checks PASS (orientation/orbit, CAD, dimensions, shear, workspace UX, graphics and accessibility). 2 orientation/grid checks PASS. Raw logs, report and hashed evidence are included. This is focused regression evidence, not a complete milestone or numerical rerun.

The compass follows the camera and identifies end-on axes. The balanced isometric default exposes X/Y equally. The XY grid sits at model minimum Z, labelled in metres; it is a visual reference and does not change the modelling plane.

Live visual review remains blocked by the browser tool policy-verification service. Required parent real-GPU evidence and full milestone acceptance remain pending. Refresh http://127.0.0.1:4173/ and choose 3D to see the change.
