export const resultFamilies = {
  shape: [
    ["model", "Model"],
    ["deformed", "Deformation"],
  ],
  forces: [
    ["axial", "N / Fx · Axial along local x"],
    ["shearY", "Vy · Shear y"],
    ["shearZ", "Vz · Shear z"],
  ],
  moments: [
    ["moment", "My · Bending about y"],
    ["momentZ", "Mz · Bending about z"],
    ["torsion", "T / Mx · Torsion about local x"],
  ],
  heatmap: [
    ["heatAxial", "|N| · Axial"],
    ["heatShearY", "|Vy| · Shear y"],
    ["heatShearZ", "|Vz| · Shear z"],
    ["heatMoment", "|My| · Bending about y"],
    ["heatMomentZ", "|Mz| · Bending about z"],
    ["heatTorsion", "|T| · Torsion"],
  ],
};
export function bindResultPicker(onChange) {
  const family = document.querySelector("#result-family");
  const component = document.querySelector("#display-result");
  const remembered = {
    shape: "model",
    forces: "axial",
    moments: "moment",
    heatmap: "heatMoment",
  };
  const sync = (value) => {
    const key =
      Object.keys(resultFamilies).find((k) =>
        resultFamilies[k].some(([v]) => v === value),
      ) || "shape";
    family.value = key;
    remembered[key] = value;
    component.replaceChildren(
      ...resultFamilies[key].map(([v, label]) => new Option(label, v)),
    );
    component.value = value;
  };
  family.onchange = () => {
    sync(remembered[family.value]);
    onChange(component.value);
  };
  component.onchange = () => {
    remembered[family.value] = component.value;
    onChange(component.value);
  };
  return sync;
}
