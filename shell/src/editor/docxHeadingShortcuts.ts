import { Extensions } from "superdoc";

// Cmd/Ctrl + 1..5 → toggle the current paragraph between Heading 1..5.
// SuperDoc doesn't ship these shortcuts out of the box.
export const createDocxHeadingShortcuts = () => {
  const apply = (level: number) => ({ editor }: any) =>
    editor.chain().focus().toggleHeading({ level }).run();

  return Extensions.Extension.create({
    name: "docxHeadingShortcuts",
    addKeyboardShortcuts() {
      return {
        "Mod-1": () => apply(1)(this),
        "Mod-2": () => apply(2)(this),
        "Mod-3": () => apply(3)(this),
        "Mod-4": () => apply(4)(this),
        "Mod-5": () => apply(5)(this),
      };
    },
  });
};
