// @ts-check
import * as typedoc from "typedoc";

/** @param {typedoc.Application} app */
export function load(app) {
  app.outputs.addOutput("schema-reference", async (outputDir, project) => {
    app.renderer.router = new SchemaReferenceRouter(app);
    app.renderer.theme = new typedoc.DefaultTheme(app.renderer);
    app.renderer.trigger(typedoc.RendererEvent.BEGIN, new typedoc.RendererEvent(outputDir, project, []));

    const pageEvents = buildPageEvents(project, app.renderer.router);
    const rendered = renderPageEvents(pageEvents, /** @type {typedoc.DefaultTheme} */ (app.renderer.theme));

    process.stdout.write(`---\n`);
    process.stdout.write(`title: Schema Reference\n`);
    process.stdout.write(`---\n\n`);
    process.stdout.write(`<div id="schema-reference" />\n\n`);
    process.stdout.write(rendered);

    // Wait for all output to be written before allowing the process to exit.
    await new Promise((resolve) => process.stdout.write("", () => resolve(undefined)));
  })

  app.outputs.setDefaultOutputName("schema-reference")
}

class SchemaReferenceRouter extends typedoc.StructureRouter {
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
    const event = new typedoc.PageEvent(pageDefinition.model)
    event.url = pageDefinition.url;
    event.filename = pageDefinition.url;
    event.pageKind = pageDefinition.kind;
    event.project = project;
    events.push(event)
  }

  return events;
}

/**
 * @param {typedoc.PageEvent[]} events
 * @param {typedoc.DefaultTheme} theme
 * @returns {string}
 */
function renderPageEvents(events, theme) {
  const declarationEvents = events.
    filter(isDeclarationReflectionEvent).
    sort((event1, event2) => event1.model.name.localeCompare(event2.model.name));

  /** @type {Map<string, string[]>} */
  const outputsByCategory = new Map();

  for (const event of declarationEvents) {
    const category = getReflectionCategory(event.model);
    const rendered = renderReflection(event.model, theme.getRenderContext(event));

    if (!outputsByCategory.has(category)) {
      outputsByCategory.set(category, [renderCategory(category)]);
    }
    outputsByCategory.get(category)?.push(rendered);
  }

  return [...outputsByCategory.keys()].
    sort().flatMap((category) => outputsByCategory.get(category)).join("\n");
}

/**
 * @param {typedoc.PageEvent} event
 * @returns {event is typedoc.PageEvent<typedoc.DeclarationReflection>}
 */
function isDeclarationReflectionEvent(event) {
  return event.model instanceof typedoc.DeclarationReflection;
}

/**
 * @param {typedoc.DeclarationReflection} reflection
 * @returns {string}
 */
function getReflectionCategory(reflection) {
  const categoryTag = reflection.comment?.getTag("@category");
  return categoryTag ? categoryTag.content.map((part) => part.text).join(" ") : "";
}

/**
 * @param {string} category
 * @returns {string}
 */
function renderCategory(category) {
  let heading = category || "Common Types";
  if (heading.match(/^[a-z]/)) heading = "`" + heading + "`";
  return `## ${heading}\n`;
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
