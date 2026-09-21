# Independent OpenSees corpus

20 original 4 x 3 m fixed-base portal variants, asymmetrical inertias,
spatial offsets and nodal actions. Cases O06–O20 additionally include global
or local uniform loading. No candidate element or assembly code is imported.
OpenSees elasticBeamColumn uses A,E,G,J,Iy,Iz and a vecxz transformation vector.
vecxz = normalised cross(member x, supplied localY); OpenSees forms local y
from vecxz cross x. Raw localForce maps directly to element nodal actions.
Reference tolerances are unchanged VALIDATION.md values. Native raw results,
OpenSees version and every comparison are recorded in oracle.json.
Primary API: https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/elasticBeamColumn.html
Source adapter: tools/oracle.py. Python environment is development only.
