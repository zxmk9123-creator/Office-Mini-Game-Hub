import { describe, expect, it } from "vitest";
import {
  renderStickyNoteFormattedHtml,
  toggleStickyNoteFormat,
} from "../notebook/stickyNoteFormatting";

describe("toggleStickyNoteFormat", () => {
  it("wraps the selection in bold markers", () => {
    const result = toggleStickyNoteFormat("hello world", 0, 5, "bold");
    expect(result.text).toBe("**hello** world");
    expect(result.text.slice(result.start, result.end)).toBe("hello");
  });

  it("wraps the selection in italic markers", () => {
    const result = toggleStickyNoteFormat("hello world", 6, 11, "italic");
    expect(result.text).toBe("hello _world_");
  });

  it("wraps the selection in strikethrough markers", () => {
    const result = toggleStickyNoteFormat("hello world", 0, 11, "strike");
    expect(result.text).toBe("~~hello world~~");
  });

  it("removes the markers when toggled again on the same wrapped text", () => {
    const bolded = toggleStickyNoteFormat("hello world", 0, 5, "bold");
    expect(bolded.text).toBe("**hello** world");
    const unbolded = toggleStickyNoteFormat(bolded.text, bolded.start, bolded.end, "bold");
    expect(unbolded.text).toBe("hello world");
    expect(unbolded.start).toBe(0);
    expect(unbolded.end).toBe(5);
  });

  it("combines bold + italic + strikethrough on the same text (order-independent)", () => {
    let current = { text: "hello", start: 0, end: 5 };
    current = toggleStickyNoteFormat(current.text, current.start, current.end, "bold");
    current = toggleStickyNoteFormat(current.text, current.start, current.end, "italic");
    current = toggleStickyNoteFormat(current.text, current.start, current.end, "strike");
    // Each toggle wraps immediately around the still-selected core text,
    // so formats nest with the first-applied format outermost.
    expect(current.text).toBe("**_~~hello~~_**");
    // The innermost "hello" is still exactly what's selected.
    expect(current.text.slice(current.start, current.end)).toBe("hello");
  });

  it("with no selection, inserts an empty marker pair and positions the cursor inside it", () => {
    const result = toggleStickyNoteFormat("", 0, 0, "bold");
    expect(result.text).toBe("****");
    expect(result.start).toBe(2);
    expect(result.end).toBe(2);
  });

  it("does not confuse italic's single underscore with an unrelated adjacent character", () => {
    const result = toggleStickyNoteFormat("a_b hello world", 4, 9, "italic");
    expect(result.text).toBe("a_b _hello_ world");
  });
});

describe("renderStickyNoteFormattedHtml", () => {
  it("renders bold, italic, and strikethrough markers as real tags", () => {
    expect(renderStickyNoteFormattedHtml("**bold**")).toBe("<strong>bold</strong>");
    expect(renderStickyNoteFormattedHtml("_italic_")).toBe("<em>italic</em>");
    expect(renderStickyNoteFormattedHtml("~~strike~~")).toBe("<s>strike</s>");
  });

  it("renders combined/nested formatting correctly", () => {
    expect(renderStickyNoteFormattedHtml("~~_**hello**_~~")).toBe("<s><em><strong>hello</strong></em></s>");
  });

  it("renders plain text with no markers unchanged (existing plain-text notes stay compatible)", () => {
    expect(renderStickyNoteFormattedHtml("just plain text")).toBe("just plain text");
  });

  it("HTML-escapes raw angle brackets/ampersands so they can never be interpreted as markup", () => {
    expect(renderStickyNoteFormattedHtml("<script>&amp;</script>")).toBe(
      "&lt;script&gt;&amp;amp;&lt;/script&gt;",
    );
  });

  it("does not let escaped user content re-open a tag across a format boundary", () => {
    // A literal "<" typed by the user must stay literal, not merge with
    // our injected tags to form new markup.
    const html = renderStickyNoteFormattedHtml("**bold < text**");
    expect(html).toBe("<strong>bold &lt; text</strong>");
  });
});
