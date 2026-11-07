// 画面の部品を作る小さな道具
const SVG_NS = "http://www.w3.org/2000/svg";

export const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function html(tag: string, attributes: Record<string, string> = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

export function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

export function button(label: string, onClick: () => void, attributes: Record<string, string> = {}) {
  const node = html("button", { type: "button", ...attributes }, label);
  node.addEventListener("click", onClick);
  return node;
}

// 使えないときは disabled、使えるときは説明(title)を付けたボタンの属性
export const enabledIf = (usable: boolean, title = ""): Record<string, string> =>
  usable ? (title ? { title } : {}) : { disabled: "" };

export function choice<T extends string>(
  label: string,
  options: readonly T[],
  names: Record<T, string>,
  value: T,
  onChange: (value: T) => void,
) {
  const select = html("select") as HTMLSelectElement;
  for (const option of options) select.append(html("option", { value: option }, names[option]));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value as T));
  return html("label", { class: "field" }, label, select);
}

export function numberField(
  label: string,
  value: number | null,
  placeholder: string,
  onChange: (value: number | null) => void,
) {
  const input = html("input", {
    type: "number",
    step: "1",
    placeholder,
    value: value === null ? "" : String(value),
  }) as HTMLInputElement;
  input.addEventListener("change", () => onChange(input.value === "" ? null : Number(input.value)));
  return html("label", { class: "field" }, label, input);
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  html("a", { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
