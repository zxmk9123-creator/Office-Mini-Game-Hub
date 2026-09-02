/**
 * Lightweight rich-text formatting for Sticky Note content.
 *
 * The content editor is a plain `<textarea>` (see StickyNotesView.tsx) —
 * deliberately kept as-is rather than replaced with a contentEditable/rich
 * editor, since a textarea cannot itself render mixed inline styles.
 * Formatting is instead represented as a small set of markdown-style
 * delimiters directly in the persisted plain-text `content` string (same
 * `text` column, same API, no schema change), and rendered as real
 * <strong>/<em>/<s> markup in a read-only preview shown whenever the note
 * isn't actively being edited (see renderFormattedPreview below). This is
 * the same reuse-the-existing-textarea approach the rest of the Sticky
 * Note editor already relies on for drag/resize/auto-height.
 *
 * Bold uses `**`, italic uses `_`, strikethrough uses `~~` — different
 * characters per format (rather than `*` for italic, which is a prefix of
 * `**` and would make adjacency-based toggling ambiguous) so the three
 * can nest/combine in any order without collisions.
 */
export type StickyNoteFormat = "bold" | "italic" | "strike";

export const STICKY_NOTE_FORMAT_MARKERS: Record<StickyNoteFormat, string> = {
  bold: "**",
  italic: "_",
  strike: "~~",
};

export interface TextSelection {
  text: string;
  start: number;
  end: number;
}

/**
 * Toggles `marker` immediately around [start, end) in `text`. If the
 * selection is already wrapped by exactly that marker on both sides, the
 * markers are removed; otherwise they're added. With no selection
 * (start === end), this inserts an empty marker pair with the resulting
 * cursor positioned between them, so text typed next lands inside the
 * formatting — the textarea's natural equivalent of a rich editor's
 * "formatting applies to subsequently typed text" behavior.
 */
export function toggleMarkerAroundSelection(
  text: string,
  start: number,
  end: number,
  marker: string,
): TextSelection {
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);
  if (before === marker && after === marker) {
    return {
      text: text.slice(0, start - marker.length) + text.slice(start, end) + text.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  return {
    text: text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end),
    start: start + marker.length,
    end: end + marker.length,
  };
}

/** Toggles the given format around the current selection of a raw content string. */
export function toggleStickyNoteFormat(
  text: string,
  start: number,
  end: number,
  format: StickyNoteFormat,
): TextSelection {
  return toggleMarkerAroundSelection(text, start, end, STICKY_NOTE_FORMAT_MARKERS[format]);
}

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Renders the raw, marker-containing content as safe HTML for the
 * read-only preview: the whole string is HTML-escaped first, then only
 * our three known marker patterns are turned into real tags — so
 * arbitrary characters a user typed (including literal `<`/`>`/`&`) can
 * never be interpreted as markup, and existing plain-text notes with no
 * markers at all render byte-for-byte as before, just escaped.
 */
export function renderStickyNoteFormattedHtml(raw: string): string {
  let html = escapeHtml(raw);
  html = html.replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>");
  html = html.replace(/~~(.+?)~~/gs, "<s>$1</s>");
  html = html.replace(/_(.+?)_/gs, "<em>$1</em>");
  return html;
}
