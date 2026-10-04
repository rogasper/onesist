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
  imagePlugin,
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
  InsertImage,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
  CodeToggle,
} from "@mdxeditor/editor";
import type { MDXEditorMethods, MDXEditorProps } from "@mdxeditor/editor";
import { $createTextNode } from "lexical";
import { workspaceImageSrc } from "~/lib/workspace-image";
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

/**
 * Uploads an image dropped/pasted/inserted in the editor and returns the path
 * the DOCUMENT stores — `input/assets/<name>`, relative to the project root.
 *
 * Deliberately not an app URL: the markdown stays readable for the agent, for
 * the task card a frontend developer opens, and for any other markdown tool. The
 * display side (`imagePreviewHandler`, `MarkdownViewer`) turns it into
 * `/api/files/image?…`.
 */
async function uploadEditorImage(file: File, projectId?: string): Promise<string> {
  if (!projectId) throw new Error("Project tidak diketahui, gambar tidak bisa diunggah.");
  // Same encoding as the chat attachment upload: base64 of the UTF-8 name, so a
  // name with spaces or accents survives the query string.
  const filename = btoa(unescape(encodeURIComponent(file.name || "gambar")));
  const res = await fetch(`/api/projects/${projectId}/assets/upload?filename=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
    cache: "no-store",
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Balasan unggahan tidak terbaca.");
  }
  if (!res.ok || !body?.path) throw new Error(body?.error ?? `Unggahan gambar gagal (HTTP ${res.status}).`);
  return body.path as string;
}

const MdxEditorInner = forwardRef<MDXEditorMethods, MDXEditorProps & { projectId?: string }>(function MdxEditorInner(
  { projectId, ...props },
  ref
) {
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
  imagePlugin({
    imageUploadHandler: (file) => uploadEditorImage(file, projectId),
    // The document stores a project-relative path; the editor shows the file
    // through the app's raw-image route.
    imagePreviewHandler: async (src) => workspaceImageSrc(src, projectId),
  }),
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
              <InsertImage />
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
