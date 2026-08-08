import { forwardRef } from "react";
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  tablePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  frontmatterPlugin,
  diffSourcePlugin,
  toolbarPlugin,
  realmPlugin,
  addImportVisitor$,
  UndoRedo,
  Separator,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ListsToggle,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
  CodeToggle,
} from "@mdxeditor/editor";
import type { MDXEditorMethods, MDXEditorProps } from "@mdxeditor/editor";
import { $createTextNode } from "lexical";
import "@mdxeditor/editor/style.css";

// Fallback for raw HTML / unknown JSX tags (e.g. `<token>` from Word exports)
// that MDXEditor has no visitor for — without this the whole document
// falls back to raw markdown and loses all formatting.
const htmlFallbackPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addImportVisitor$]: [
        {
          testNode: (n: { type: string }) =>
            n.type === "html" || n.type === "mdxJsxTextElement" || n.type === "mdxJsxFlowElement",
          visitNode({ mdastNode, lexicalParent, actions }: { mdastNode: any; lexicalParent: any; actions: any }) {
            const value = mdastNode.value;
            if (typeof value === "string") {
              actions.addAndStepInto($createTextNode(value.replace(/<[^>]*>/g, "")));
              return;
            }
            actions.visitChildren(mdastNode, lexicalParent);
          },
          priority: -200,
        },
      ],
    });
  },
});

const MdxEditorInner = forwardRef<MDXEditorMethods, MDXEditorProps & { projectId?: string }>(function MdxEditorInner(props, ref) {
  return (
    <MDXEditor
      ref={ref}
      {...props}
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        codeBlockPlugin({
          defaultCodeBlockLanguage: "",
        }),
        codeMirrorPlugin({
          codeBlockLanguages: {
            mermaid: "Mermaid",
            js: "JavaScript",
            ts: "TypeScript",
            json: "JSON",
            md: "Markdown",
            plain: "Plain text",
            shell: "Shell",
            bash: "Bash",
            python: "Python",
            sql: "SQL",
            yaml: "YAML",
            html: "HTML",
            css: "CSS",
          },
        }),
        tablePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        linkPlugin(),
        frontmatterPlugin(),
        htmlFallbackPlugin(),
        diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: "No changes." }),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <BlockTypeSelect />
              <BoldItalicUnderlineToggles />
              <Separator />
              <ListsToggle options={["bullet", "number", "check"]} />
              <Separator />
              <CreateLink />
              <InsertCodeBlock />
              <InsertTable />
              <InsertThematicBreak />
              <Separator />
              <DiffSourceToggleWrapper>
                <CodeToggle />
              </DiffSourceToggleWrapper>
            </>
          ),
        }),
      ]}
    />
  );
});

MdxEditorInner.displayName = "MdxEditorInner";

export default MdxEditorInner;
