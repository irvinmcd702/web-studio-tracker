import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from "../components/ui/form";

/**
 * The label used to sit next to the control rather than being attached to it:
 * a <label> with no htmlFor, an input with no id, correct on screen and silent
 * to anything that could not see it. Around a hundred fields go through this
 * one component, so the fix is here and so is the test.
 *
 * Rendering to markup rather than driving a browser keeps this in the suite
 * that already runs. It cannot tell you a field is usable — that is what the
 * axe pass is for — but it can tell you the wiring is still there, which is
 * the part that was silently missing and would go missing again.
 */

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

/** The value of one attribute on the first tag of the given name. */
function attr(markup: string, tag: string, name: string) {
  const open = markup.match(new RegExp(`<${tag}\\b[^>]*>`));
  if (!open) return null;
  const found = open[0].match(new RegExp(`${name}="([^"]*)"`));
  return found ? found[1] : null;
}

describe("a field and its control", () => {
  it("points the label at the input, and gives the input that id", () => {
    const markup = html(
      <Field label="Project name">
        <Input name="name" />
      </Field>,
    );

    const target = attr(markup, "label", "for");
    expect(target).toBeTruthy();
    expect(attr(markup, "input", "id")).toBe(target);
  });

  it("does the same for a select and a textarea", () => {
    const select = html(
      <Field label="Client">
        <Select name="clientId" />
      </Field>,
    );
    expect(attr(select, "select", "id")).toBe(attr(select, "label", "for"));

    const textarea = html(
      <Field label="Description">
        <Textarea name="description" />
      </Field>,
    );
    expect(attr(textarea, "textarea", "id")).toBe(
      attr(textarea, "label", "for"),
    );
  });

  it("gives two fields on one page different ids", () => {
    const markup = html(
      <form>
        <Field label="One">
          <Input name="one" />
        </Field>
        <Field label="Two">
          <Input name="two" />
        </Field>
      </form>,
    );

    const ids = [...markup.matchAll(/<input\b[^>]*id="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("reads the hint out after the name instead of leaving it as scenery", () => {
    const markup = html(
      <Field label="Key" hint="Leave blank to generate">
        <Input name="key" />
      </Field>,
    );

    const describedBy = attr(markup, "input", "aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(markup).toContain(`id="${describedBy}"`);
    expect(markup).toContain("Leave blank to generate");
  });

  it("keeps the required star out of the field's spoken name", () => {
    // The control's own `required` is what gets announced; the star would
    // otherwise be read as part of the name — "Project name star".
    const markup = html(
      <Field label="Project name" required>
        <Input name="name" required />
      </Field>,
    );

    expect(markup).toMatch(/<span aria-hidden="true"[^>]*>\s*\*<\/span>/);
  });

  it("leaves a control alone when it is used outside a field", () => {
    const markup = html(<Input name="loose" />);

    expect(attr(markup, "input", "id")).toBeNull();
    expect(attr(markup, "input", "aria-describedby")).toBeNull();
    expect(attr(markup, "input", "aria-invalid")).toBeNull();
  });

  it("lets a caller that wired its own id keep it", () => {
    const markup = html(
      <Field label="Title">
        <Input name="title" id="meeting-title" />
      </Field>,
    );

    expect(attr(markup, "input", "id")).toBe("meeting-title");
  });
});

describe("a field that is wrong", () => {
  const broken = () =>
    html(
      <Field label="Key" hint="Leave blank to generate" error="Already taken">
        <Input name="key" />
      </Field>,
    );

  it("marks the control invalid", () => {
    expect(attr(broken(), "input", "aria-invalid")).toBe("true");
  });

  it("announces the message where the field is", () => {
    expect(broken()).toMatch(/role="alert"/);
    expect(broken()).toContain("Already taken");
  });

  it("describes the control with the hint and the error, in that order", () => {
    const markup = broken();
    const ids = (attr(markup, "input", "aria-describedby") ?? "").split(" ");

    expect(ids).toHaveLength(2);
    for (const id of ids) expect(markup).toContain(`id="${id}"`);

    // The hint explains the field, the error explains the refusal; hearing
    // them the other way round is hearing the complaint before the subject.
    expect(markup.indexOf(`id="${ids[0]}"`)).toBeLessThan(
      markup.indexOf(`id="${ids[1]}"`),
    );
  });

  it("says nothing when there is no error", () => {
    const markup = html(
      <Field label="Key">
        <Input name="key" />
      </Field>,
    );

    expect(markup).not.toContain("role=\"alert\"");
    expect(attr(markup, "input", "aria-invalid")).toBeNull();
  });
});

describe("a form that failed as a whole", () => {
  it("announces the message rather than only colouring it", () => {
    const markup = html(<FormError message="That project no longer exists" />);

    expect(attr(markup, "p", "role")).toBe("alert");
    expect(markup).toContain("That project no longer exists");
  });

  it("renders nothing at all when there is nothing to say", () => {
    expect(html(<FormError message={null} />)).toBe("");
  });
});
