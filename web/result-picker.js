export const resultFamilies = {
  shape: [
    ["model", "Model"],
    ["deformed", "Deformation"],
  ],
  forces: [
    ["axial", "N · Axial"],
    ["shearY", "Vy · Shear y"],
    ["shearZ", "Vz · Shear z"],
  ],
  moments: [
    ["moment", "My · Bending about y"],
    ["momentZ", "Mz · Bending about z"],
    ["torsion", "T · Torsion about x"],
  ],
};
export function bindResultPicker(onChange) {
  const family = document.querySelector("#result-family");
  const component = document.querySelector("#display-result");
  const remembered = { shape: "model", forces: "axial", moments: "moment" };
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
