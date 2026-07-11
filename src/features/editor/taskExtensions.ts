import TaskItem, { type TaskItemOptions } from "@tiptap/extension-task-item";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

function applyDomAttributes(element: HTMLElement, attributes: Record<string, unknown>) {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) {
      element.removeAttribute(key);
      return;
    }
    element.setAttribute(key, value === true ? "" : String(value));
  });
}

function syncTaskItemDom(listItem: HTMLLIElement, checkbox: HTMLInputElement, node: ProseMirrorNode, label: string) {
  const checked = Boolean(node.attrs.checked);
  listItem.dataset.checked = String(checked);
  checkbox.checked = checked;
  checkbox.ariaLabel = label;
}

export const NoteFlowTaskItem = TaskItem.extend({
  addOptions(): TaskItemOptions {
    const parentOptions = this.parent?.() ?? {
      HTMLAttributes: {},
      nested: false,
      taskListTypeName: "taskList",
    };
    const parentClass = typeof parentOptions.HTMLAttributes.class === "string" ? parentOptions.HTMLAttributes.class : "";
    return {
      ...parentOptions,
      HTMLAttributes: {
        ...parentOptions.HTMLAttributes,
        class: [parentClass, "noteflow-task-item"].filter(Boolean).join(" "),
      },
      nested: true,
    };
  },

  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      let currentNode = node;
      const options = this.options;
      const type = this.type;

      const listItem = document.createElement("li");
      const checkboxWrapper = document.createElement("label");
      const checkbox = document.createElement("input");
      const checkboxVisual = document.createElement("span");
      const content = document.createElement("div");

      checkboxWrapper.contentEditable = "false";
      checkboxWrapper.className = "noteflow-task-checkbox";
      checkbox.type = "checkbox";
      checkboxVisual.setAttribute("aria-hidden", "true");
      checkboxVisual.className = "noteflow-task-checkmark";
      content.className = "noteflow-task-content";

      listItem.setAttribute("data-type", "taskItem");
      listItem.classList.add("noteflow-task-item");
      applyDomAttributes(listItem, options.HTMLAttributes);
      applyDomAttributes(listItem, HTMLAttributes);
      listItem.classList.add("noteflow-task-item");

      const getCheckboxLabel = (taskNode: ProseMirrorNode) => {
        return options.a11y?.checkboxLabel?.(taskNode, Boolean(taskNode.attrs.checked)) ?? `Task item: ${taskNode.textContent || "empty task item"}`;
      };

      checkbox.addEventListener("mousedown", (event) => event.preventDefault());
      checkbox.addEventListener("change", (event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }

        const checked = event.target.checked;
        if (!editor.isEditable) {
          if (!options.onReadOnlyChecked?.(currentNode, checked)) {
            event.target.checked = !checked;
          }
          return;
        }

        if (typeof getPos !== "function") {
          return;
        }

        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .command(({ tr }) => {
            const position = getPos();
            if (typeof position !== "number") {
              return false;
            }
            const taskNode = tr.doc.nodeAt(position);
            if (!taskNode || taskNode.type !== type) {
              return false;
            }
            tr.setNodeMarkup(position, undefined, {
              ...taskNode.attrs,
              checked,
            });
            return true;
          })
          .run();
      });

      checkboxWrapper.append(checkbox, checkboxVisual);
      listItem.append(checkboxWrapper, content);
      syncTaskItemDom(listItem, checkbox, currentNode, getCheckboxLabel(currentNode));

      return {
        dom: listItem,
        contentDOM: content,
        update: (updatedNode) => {
          if (updatedNode.type !== type) {
            return false;
          }
          currentNode = updatedNode;
          applyDomAttributes(listItem, HTMLAttributes);
          listItem.classList.add("noteflow-task-item");
          syncTaskItemDom(listItem, checkbox, updatedNode, getCheckboxLabel(updatedNode));
          return true;
        },
      };
    };
  },
});
