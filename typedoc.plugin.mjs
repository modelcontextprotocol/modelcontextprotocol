// @ts-check
import { readFile } from "fs/promises";
import * as cheerio from "cheerio";
import * as typedoc from "typedoc";

// Markdown (and JSX) special characters that should be rendered literally
const MARKDOWN_SPECIAL_CHARS = ["[", "_", "*", "`", "~", "\\", "$", "{"];
const MARKDOWN_SPECIAL_CHARS_REGEX = new RegExp(
  "[" + MARKDOWN_SPECIAL_CHARS.map(c => "\\" + c).join("") + "]", "g"
);
const MARKDOWN_SPECIAL_CHARS_HTML_ENTITIES = Object.fromEntries(
  MARKDOWN_SPECIAL_CHARS.map(c => [c, `&#x${c.charCodeAt(0).toString(16).toUpperCase()};`])
);

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

    const outputEvent = new typedoc.RendererEvent(outputDir, project, []);
    await app.renderer.theme.preRender(outputEvent);
    app.renderer.trigger(typedoc.RendererEvent.BEGIN, outputEvent);

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
    // Must use `toLowerCase()` because Mintlify generates lower case IDs for Markdown headings.
    return super.getFullUrl(target).replace(".html", "").replaceAll(/[./#]/g, "-").toLowerCase();
  }
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
    order ||= +reflection2.name.endsWith("ResultResponse") - +reflection1.name.endsWith("ResultResponse");
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
  const members = reflection.children ?? [];

  const codeBlock = context.reflectionPreview(reflection);

  let content = codeBlock ?
    // Interfaces/classes: render preview, summary, members, then block tags (e.g., `@example`).
    renderJsxElements(
      codeBlock,
      context.commentSummary(reflection),
      context.commentTags(reflection),
      members.map(member => context.member(member)),
    ) :
    // Type aliases: `memberDeclaration` handles signature, summary, and block tags internally.
    renderJsxElements(
      context.memberDeclaration(reflection),
      members.map(member => context.member(member)),
    );

  // Use cheerio for robust HTML transformations
  const $ = cheerio.load(content, { xml: { decodeEntities: false } });

  // Wrap `@example` blocks in `<details>` elements for collapsibility, move
  // `id` to first element of hidden content so browser auto-expands on fragment
  // navigation, and prefix `id` with the reflection's anchor for namespacing.
  $(".tsd-tag-example").each((_, el) => {
    const h4 = $(el).children("h4:first-child")[0];
    const namespacedId = `${context.getAnchor(reflection)}-${h4.attribs.id}`;
    $(h4).removeAttr("id");
    $(h4).next().attr("id", namespacedId);
    $(h4).find("a.tsd-anchor-icon").attr("href", `#${namespacedId}`);
    h4.tagName = "summary";
    el.tagName = "details";
  });

  // Convert `<hN>` elements to `<div data-typedoc-h="N">`.
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    $(el).attr("data-typedoc-h", el.tagName[1]);
    el.tagName = "div";
  });

  // Remove ids for `@see` blocks because they are not unique
  $('[id="see"]').removeAttr("id");

  // Copy member type signature text into its heading anchor, and remove the
  // signature (which is redundant with the overall type signature).
  $(".tsd-member").each((_, el) => {
    const anchor = $(el).find(".tsd-anchor-link");
    const signature = $(el).find(".tsd-signature");

    // Clean up signature text for complex member types.
    const signatureText = signature.text().
      replaceAll("\u00A0", " ").
      replace(/;}$/, "; }");

    // Remove "Optional" tags in favor of signature text.
    anchor.find(".tsd-tag").remove();

    anchor.find("span:first-child").text(signatureText);
    signature.remove();
  });

  // Serialize back to HTML
  content = $.html();

  // Reduce code block indent from 4 spaces to 2 spaces.
  content = content.replaceAll("\u00A0\u00A0", "\u00A0");

  // Accommodate Mintlify's janky Markdown parser.
  content = content.
    replaceAll("\u00A0", "&nbsp;"). // Encode valid UTF-8 character as HTML entity
    replaceAll(/\n+</g, " <"). // Newlines around tags are not significant
    replaceAll( // Treat special characters inside HTML as literal text, not Markdown
      MARKDOWN_SPECIAL_CHARS_REGEX,
      char => MARKDOWN_SPECIAL_CHARS_HTML_ENTITIES[char]
    );

  return `<div class="type">\n\n### \`${name}\`\n\n${content}\n</div>\n\n`;
}

/**
 * @param {typedoc.JSX.Children[]} elements
 */
function renderJsxElements(...elements) {
  return typedoc.JSX.renderElement(typedoc.JSX.createElement(typedoc.JSX.Fragment, null, elements));
}
