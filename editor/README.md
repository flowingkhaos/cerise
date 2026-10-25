# editor/

The post editor: ProseMirror, no framework, markdown in and markdown out. The island that mounts it is
`islands/Editor.tsx`; its styles are `styles/editor.css`.

| File          | Holds                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `schema.ts`   | The document model: exactly what `md` (lib/markdown.ts) parses              |
| `markdown.ts` | `parse(source, env?)` and `serialize(doc)`; `attrText` for component attrs  |
| `commands.ts` | Toolbar commands, keymap, typed-markdown rules, `plugins()`. No DOM         |
| `views.ts`    | Node views for `Callout` (type picker) and `Figure` (caption, alt). Browser |

## One parser

`parse` is a prosemirror-markdown `MarkdownParser` over `md`, the same markdown-it instance the server renders with.
Never build another one: the editor can then only hold what a saved post can contain, and an unknown component or a bad
`Figure` src comes back in `env.errors`, exactly as the server sees it.

## Round trip

`markdown_test.ts` holds the contract: for every seed post and for a fixture with every node and mark,
`render(serialize(parse(body)))` equals `render(body)`, the re-parsed document equals the first one, and serializing
twice gives the same text.

One difference is deliberate. A soft line break (a newline inside a paragraph, as in hard-wrapped markdown) becomes a
space in the editor, as in every rich editor; md renders it as `"\n"`. So the test renders soft breaks as spaces on the
expected side. The visible page is the same. The source changes on first save: each paragraph then sits on one line. An
untouched document keeps its exact original text, because the island writes `initial` back whenever the document equals
it.

The serializer escapes what md would otherwise read as structure: block markers at the start of a line (also after a
hard break), `<` before a letter or `/` (autolinks, components), `&name;` entities, a trailing `#` in a heading.
Adjacent lists alternate their markers (`-`/`*`, `.`/`)`) so md keeps them apart. Tight lists stay tight. Component
attributes cannot hold `"` (md does not decode entities there), so `attrText` turns straight quotes into curly ones and
newlines into spaces.

Known limits, all from documents only the editor can make: a mark that opens next to punctuation inside a word
(`a**«b»**c`) is not emphasis to CommonMark; a callout pasted inside a list inside a callout cannot be written so md
reads it back (md reports it, the server refuses the save).

## Adding a node or mark

Add it to `lib/markdown.ts` first (rule + renderer + sanitizer allow-list in `lib/render.ts`), then here: the schema
spec, a token spec in the parser, a serializer function, and a line in the fixture of `markdown_test.ts`. The test fails
until all four agree.
