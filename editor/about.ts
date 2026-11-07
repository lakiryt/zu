// 「Law図 について」の窓。本文は index.html に書いてあり、ここでは開け閉めと例の図だけを受け持つ
import { render } from "../src/index.ts";

const dialog = () => document.getElementById("about") as HTMLDialogElement;

export function openAbout() {
  const about = dialog();
  // 例の図は、窓にある文字から初めて開いたときに描く(文字と図がずれないよう、図は手で書かない)
  const result = about.querySelector(".result")!;
  if (!result.firstChild) {
    result.innerHTML = render(about.querySelector("#about-example")!.textContent ?? "");
  }
  about.showModal();
}

export function setUpAbout() {
  const about = dialog();
  document.querySelector(".about-open")?.addEventListener("click", openAbout);
  about.querySelector(".about-close")?.addEventListener("click", () => about.close());
  // 窓の外(背景)を押しても閉じる
  about.addEventListener("click", (event) => {
    if (event.target === about) about.close();
  });
}
