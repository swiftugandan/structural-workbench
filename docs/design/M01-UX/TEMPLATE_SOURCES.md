# Model template data and assumptions

Verified against the primary references below on 22 September 2026. Templates populate draft inputs; the existing Rust command validation and analysis kernel remain authoritative. No new engineering formula is implemented in JavaScript. All values remain editable. Shapes are labelled schematic, not CAD representations of fillets or exact wall geometry.

## Catalogue sections

Two sizes are provided for each of four common steel-section families. A is in cm²; Iy, Iz and the Saint-Venant torsion constant J are in cm⁴ in this transcription. Source Iy/Iyy maps to local y; source Iz/Izz maps to local z. Stored SI conversions are 1 cm² = 1e-4 m² and 1 cm⁴ = 1e-8 m⁴. Extreme-fibre distances are half the catalogue width/depth (or outside diameter) for these doubly symmetric sections.

| Section | A | Iy | Iz | J | Width × depth (mm) |
| --- | ---: | ---: | ---: | ---: | --- |
| IPE 200 | 28.5 | 1940 | 142 | 6.92 | 100 × 200 |
| IPE 300 | 53.8 | 8360 | 604 | 19.9 | 150 × 300 |
| HF SHS 100×100×5 | 18.7 | 279 | 279 | 439 | 100 × 100 |
| HF SHS 100×100×6.3 | 23.2 | 336 | 336 | 534 | 100 × 100 |
| HF RHS 150×100×5 | 23.7 | 739 | 392 | 807 | 100 × 150 |
| HF RHS 150×100×6.3 | 29.5 | 898 | 474 | 986 | 100 × 150 |
| HF CHS 114.3×5 | 17.2 | 257 | 257 | 514 | diameter 114.3 |
| HF CHS 114.3×6.3 | 21.4 | 313 | 313 | 625 | diameter 114.3 |

Sources: [ArcelorMittal Orange Book, IPE properties](https://orangebook.arcelormittal.com/node/6), [SCI Blue Book, hot-finished SHS](https://www.steelforlifebluebook.co.uk/hfshs/ec3-ukna/section-properties-dimensions-properties), [hot-finished RHS](https://www.steelforlifebluebook.co.uk/hfrhs/ec3-ukna/section-properties-dimensions-properties), [hot-finished CHS](https://www.steelforlifebluebook.co.uk/hfchs/ec3-ukna/section-properties-dimensions-properties).

The SCI HTML tables were read through their publicly linked DataTable_SecPropsDimsProps endpoint and the page's explicit XML identifier (ec3_properties_hfshs/hfrhs/hfchs_uk-v18.xml). The displayed table precision is preserved. For example, CHS 114.3×6.3 gives I=313 and J=625 independently rounded; do not silently replace J with twice the rounded I. These are hot-finished properties, not cold-formed substitutes. IPE properties follow the current Orange Book values above rather than a different-edition table.

Choosing a template does not change the assigned material. Editing a catalogue numeric property clears its matching diagram and marks unchanged provenance as “Modified from …” when saved.

## Material templates

| Template | E (GPa) | ν | Density (kg/m³) | Scope |
| --- | ---: | ---: | ---: | --- |
| Structural steel | 210 | 0.30 | 7850 | Generic linear elastic steel; no grade/yield strength assignment |
| Aluminium | 70 | 0.33 | 2700 | Typical elastic aluminium; no alloy/temper assignment |
| Concrete C25/30 | 31 | 0.20 | 2500 | Short-term, uncracked, quartzite-aggregate stiffness; reinforced-concrete density assumption |

Steel: [SCI/BCSA steel material properties](https://steelconstruction.info/topics/design/steel-material-properties), with density and Poisson ratio corroborated by [SCIA's documented steel material example](https://help.scia.net/api/25.0.5008/api/adm/ModelExchanger.AnalysisDataModel.Libraries.StructuralMaterial.html).

Aluminium: [COMSOL's published die-forming material input table](https://doc.comsol.com/6.4/doc/com.comsol.help.models.nsm.die_forming/die_forming.html); only its elastic E, ν and density are used, not its plasticity formulation.

Concrete: [The Concrete Centre EC2 guide, Table 3.1 and uncracked Poisson ratio](https://www.concretecentre.com/TCC/media/TCCMediaLibrary/Events/Online%20course/CCIP_EC2_Bridges.pdf), [aggregate influence](https://www.concretecentre.com/TCC/media/TCCMediaLibrary/PDF%20attachments/Lecture-2-Materials%2C-cover-and-some-definitions-Autumn-2017.pdf), and the [SCIA concrete material example](https://help.scia.net/api/25.0.5008/api/adm/ModelExchanger.AnalysisDataModel.Libraries.StructuralMaterial.html) for the 2500 kg/m³ density assumption. Cracking, creep, reinforcement stiffness, strength and code design are not modelled by these presets. Timber is intentionally not offered as an isotropic preset.

## Load templates

Point force: 10 kN global −Z at a node. Uniform: 1 kN/m global −Z over a complete member. Horizontal force: 10 kN global +X at a node. Uplift: 1 kN/m global +Z over a complete member. Moment: 5 kNm global +Y at a node. Self-weight: factor 1, initially selecting all current members; the kernel uses the project's gravity vector and assigned section/material properties.

These are example magnitudes and load arrangements, not calculated wind pressure, occupancy loading, design factors or regulatory recommendations. The current case and compatible current target are retained when choosing a template. All are editable and saved atomically. Triangular/trapezoidal loading and interior point actions are not advertised as supported.
