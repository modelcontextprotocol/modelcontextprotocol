// @ts-check
import { readFile } from "fs/promises";
import * as typedoc from "typedoc";

/** @param {typedoc.Application} app */
export function load(app) {
  app.options.addDeclaration({
    name: "schemaPageTemplate",
    help: "Template file for schema reference page.",
    type: typedoc.ParameterType.String,
  });

  app.outputs.addOutput("schema-page", async (outputDir, project) => {
    const templatePath = /** @type {string} */ (app.options.getValue("schemaPageTemplate"));
    const template = await readFile(templatePath, { encoding: "utf-8" });

    app.renderer.router = new SchemaPageRouter(app);
    app.renderer.theme = new typedoc.DefaultTheme(app.renderer);
    app.renderer.trigger(typedoc.RendererEvent.BEGIN, new typedoc.RendererEvent(outputDir, project, []));

    const pageEvents = buildPageEvents(project, app.renderer.router);

    process.stdout.write(
      renderTemplate(template, pageEvents, /** @type {typedoc.DefaultTheme} */ (app.renderer.theme))
    );

    // Wait for all output to be written before allowing the process to exit.
    await new Promise((resolve) => process.stdout.write("", () => resolve(undefined)));
  })

  app.outputs.setDefaultOutputName("schema-page")
}

class SchemaPageRouter extends typedoc.StructureRouter {
  /**
   * @param {typedoc.RouterTarget} target
   * @returns {string}
   */
  getFullUrl(target) {
    return "#" + this.getAnchor(target);
  }

  /**
   * @param {typedoc.RouterTarget} target
   * @returns {string}
   */
  getAnchor(target) {
    if (target instanceof typedoc.DeclarationReflection &&
      target.kindOf(typedoc.ReflectionKind.Property) &&
      !hasComment(target)
    ) {
      return "";
    } else {
      // Must use `toLowerCase()` because Mintlify generates lower case IDs for Markdown headings.
      return super.getFullUrl(target).replace(".html", "").replaceAll(/[./#]/g, "-").toLowerCase();
    }
  }
}

/**
 * @param {typedoc.DeclarationReflection} member
 * @returns {boolean}
 */
function hasComment(member) {
  return member.hasComment() || (
    member.type instanceof typedoc.ReflectionType &&
    !!member.type.declaration.children?.some((child) => hasComment(child))
  );
}

/**
 * @param {typedoc.ProjectReflection} project
 * @param {typedoc.Router} router
 * @returns {typedoc.PageEvent[]}
 */
function buildPageEvents(project, router) {
  const events = [];

  for (const pageDefinition of router.buildPages(project)) {
    const event = new typedoc.PageEvent(pageDefinition.model);
    event.url = pageDefinition.url;
    event.filename = pageDefinition.url;
    event.pageKind = pageDefinition.kind;
    event.project = project;
    events.push(event);
  }

  return events;
}

/**
 *
 * @param {string} template
 * @param {typedoc.PageEvent[]} pageEvents
 * @param {typedoc.DefaultTheme} theme
 * @returns {string}
 */
function renderTemplate(template, pageEvents, theme) {
  const reflectionEvents = pageEvents.filter(isDeclarationReflectionEvent);

  /** @type {Set<string>} */
  const renderedCategories = new Set();

  const rendered = template.replaceAll(
    /^\{\/\* @category (.+) \*\/\}$/mg,
    (match, category) => {
      renderedCategories.add(category);
      return renderCategory(category, reflectionEvents, theme);
    }
  );

  const missingCategories = reflectionEvents.
    map((event) => getReflectionCategory(event.model)).
    filter((category) => category && !renderedCategories.has(category)).
    filter((category, i, array) => array.indexOf(category) === i). // Remove duplicates.
    sort();

  if (missingCategories.length > 0) {
    throw new Error(
      "The following categories are missing from the schema page template:\n\n" +
      missingCategories.map((category) => `- ${category}\n`).join("")
    );
  }

  return rendered;
}

/**
 * @param {typedoc.PageEvent} event
 * @returns {event is typedoc.PageEvent<typedoc.DeclarationReflection>}
 */
function isDeclarationReflectionEvent(event) {
  return event.model instanceof typedoc.DeclarationReflection;
}

/**
 * @param {string} category
 * @param {typedoc.DeclarationReflection} reflection1
 * @param {typedoc.DeclarationReflection} reflection2
 * @returns {number}
 */
function getReflectionOrder(category, reflection1, reflection2) {
  let order = 0;

  if (isRpcMethodCategory(category)) {
    order ||= +reflection2.name.endsWith("Request") - +reflection1.name.endsWith("Request");
    order ||= +reflection2.name.endsWith("RequestParams") - +reflection1.name.endsWith("RequestParams");
    order ||= +reflection2.name.endsWith("Result") - +reflection1.name.endsWith("Result");
    order ||= +reflection2.name.endsWith("Notification") - +reflection1.name.endsWith("Notification");
    order ||= +reflection2.name.endsWith("NotificationParams") - +reflection1.name.endsWith("NotificationParams");
  }

  order ||= reflection1.name.localeCompare(reflection2.name);

  return order;
}

/**
 * @param {typedoc.DeclarationReflection} reflection
 * @returns {string | undefined}
 */
function getReflectionCategory(reflection) {
  const categoryTag = reflection.comment?.getTag("@category");
  return categoryTag ? categoryTag.content.map((part) => part.text).join(" ") : undefined;
}

/**
 * @param {string} category
 * @returns {boolean}
 */
function isRpcMethodCategory(category) {
  return /^`[a-z]/.test(category);
}

/**
 * @param {string} category
 * @param {typedoc.PageEvent<typedoc.DeclarationReflection>[]} events
 * @param {typedoc.DefaultTheme} theme
 * @returns {string}
 */
function renderCategory(category, events, theme) {
  const categoryEvents = events.filter((event) => getReflectionCategory(event.model) === category);

  if (categoryEvents.length === 0) {
    throw new Error(`Invalid category: ${category}`);
  }

  return categoryEvents.
    sort((event1, event2) => getReflectionOrder(category, event1.model, event2.model)).
    map((event) => renderReflection(event.model, theme.getRenderContext(event))).
    join("\n");
}

/**
 * @param {typedoc.DeclarationReflection} reflection
 * @param {typedoc.DefaultThemeRenderContext} context
 * @returns {string}
 */
function renderReflection(reflection, context) {
  const name = reflection.getFriendlyFullName();
  const members = reflection.children?.filter(hasComment) ?? [];

  const codeBlock = context.reflectionPreview(reflection);

  let content = renderJsxElements(
    codeBlock ?
      [codeBlock, context.commentSummary(reflection)] :
      context.memberDeclaration(reflection),
    members.map(member => context.member(member)),
  );

  // Convert `<hN>` elements to `<div>`.
  content = content.
    replaceAll(/<h([1-6])/g, `<div data-typedoc-h="$1"`).
    replaceAll(/<\/h[1-6]>/g, `</div>`);

  // Reduce code block indent from 4 spaces to 2 spaces.
  content = content.replaceAll("\u00A0\u00A0", "\u00A0");

  // Accommodate Mintlify's broken Markdown parser.
  content = content.
    replaceAll("\u00A0", "&nbsp;"). // Encode valid UTF-8 character as HTML entity
    replaceAll(/\n+</g, " <"). // Newlines around tags are not significant
    replaceAll("[", "&#x5B;"). // `[` inside HTML tags != link
    replaceAll("_", "&#x5F;"). // `_` inside HTML tags != emphasis
    replaceAll("{", "&#x7B;"). // Plain *.md is not supported, so must escape JSX interpolation
    replaceAll("$", "&#x24;"); // `$` does not demarcate LaTeX(?)


  // Remove `@TJS-type` tags.  (Ideally, we would include this tag in
  // `excludeTags`, but a TypeDoc bug rejects tag names with dashes.)
  content = content.replaceAll(/<p>@TJS-type [^<]+<\/p>/g, "");

  return `### \`${name}\`\n\n${content}\n`;
}

/**
 * @param {typedoc.JSX.Children[]} elements
 */
function renderJsxElements(...elements) {
  return typedoc.JSX.renderElement(typedoc.JSX.createElement(typedoc.JSX.Fragment, null, elements));
}
