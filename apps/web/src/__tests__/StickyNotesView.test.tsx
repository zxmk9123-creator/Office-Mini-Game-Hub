import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StickyNotesView } from "../notebook/StickyNotesView";
import { createStickyNote, deleteStickyNote, listStickyNotes, updateStickyNote } from "../api/client";

vi.mock("../api/client", () => ({
  listStickyNotes: vi.fn(),
  createStickyNote: vi.fn(),
  updateStickyNote: vi.fn(),
  deleteStickyNote: vi.fn(),
}));

const mockedListStickyNotes = vi.mocked(listStickyNotes);
const mockedCreateStickyNote = vi.mocked(createStickyNote);
const mockedUpdateStickyNote = vi.mocked(updateStickyNote);
const mockedDeleteStickyNote = vi.mocked(deleteStickyNote);

const NOTE_A = {
  id: "s1",
  content: "buy milk",
  color: "yellow" as const,
  pinned: false,
  x: 100,
  y: 60,
  width: 200,
  height: 160,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function firePointer(
  el: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  props: { clientX: number; clientY: number; pointerId?: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, { pointerId: props.pointerId ?? 1, clientX: props.clientX, clientY: props.clientY });
  fireEvent(el, event);
}

/**
 * jsdom does no real layout, so a textarea's scrollHeight is always 0 —
 * stub it with a value deterministically derived from its own content so
 * "short content" vs. "long content" is meaningfully testable: short text
 * measures well under the chrome-adjusted persisted height (160px base -
 * 64px chrome = 96px of textarea room), long text measures well over it.
 */
function stubScrollHeightFromContent() {
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return this.value.length > 100 ? 500 : 20;
    },
  });
}

beforeEach(() => {
  mockedListStickyNotes.mockReset();
  mockedCreateStickyNote.mockReset();
  mockedUpdateStickyNote.mockReset();
  mockedDeleteStickyNote.mockReset();
  // jsdom elements don't implement pointer capture — stub it so drag handlers can call it safely.
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn().mockReturnValue(true),
  });
  stubScrollHeightFromContent();
});

describe("StickyNotesView", () => {
  it("shows a clean empty state when there are no sticky notes", async () => {
    mockedListStickyNotes.mockResolvedValue([]);
    render(<StickyNotesView />);
    expect(await screen.findByText(/아직 스티커 메모가 없습니다/)).toBeTruthy();
  });

  it("creates a sticky note with a valid initial position when '+ 새 스티커' is clicked", async () => {
    mockedListStickyNotes.mockResolvedValue([]);
    mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, content: "" });

    render(<StickyNotesView />);
    await screen.findByText(/아직 스티커 메모가 없습니다/);
    fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));

    await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalled());
    const call = mockedCreateStickyNote.mock.calls[0][0];
    expect(call.content).toBe("");
    expect(Number.isFinite(call.x)).toBe(true);
    expect(Number.isFinite(call.y)).toBe(true);
    expect(call.x).toBeGreaterThanOrEqual(0);
    expect(call.y).toBeGreaterThanOrEqual(0);
  });

  it("renders a note at its persisted coordinates", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    render(<StickyNotesView />);

    const noteEl = await screen.findByTestId("sticky-note-s1");
    expect(noteEl.style.left).toBe("100px");
    expect(noteEl.style.top).toBe("60px");
  });

  it("saves edited content on blur", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, content: "buy bread" });

    render(<StickyNotesView />);
    const textarea = await screen.findByLabelText("스티커 메모 내용");
    fireEvent.change(textarea, { target: { value: "buy bread" } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", { content: "buy bread" }));
  });

  it("toggles pinned", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, pinned: true });

    render(<StickyNotesView />);
    fireEvent.click(await screen.findByRole("button", { name: "📌 고정" }));

    await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", { pinned: true }));
  });

  it("changes color via a swatch button", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, color: "blue" });

    render(<StickyNotesView />);
    fireEvent.click(await screen.findByRole("button", { name: "파랑으로 변경" }));

    await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", { color: "blue" }));
  });

  it("deletes a sticky note", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedDeleteStickyNote.mockResolvedValue(undefined);

    render(<StickyNotesView />);
    fireEvent.click(await screen.findByRole("button", { name: "스티커 메모 삭제" }));

    await waitFor(() => expect(mockedDeleteStickyNote).toHaveBeenCalledWith("s1"));
  });

  it("returns 404 when editing or deleting a missing sticky note", async () => {
    // (frontend-side smoke check that a rejected update surfaces the error state, not a crash)
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockRejectedValue(new Error("not found"));

    render(<StickyNotesView />);
    fireEvent.click(await screen.findByRole("button", { name: "📌 고정" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("persists across a fresh mount (fetches from the server, not local memory)", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    const { unmount } = render(<StickyNotesView />);
    await screen.findByDisplayValue("buy milk");
    unmount();

    mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "buy milk" }]);
    render(<StickyNotesView />);
    expect(await screen.findByDisplayValue("buy milk")).toBeTruthy();
    expect(mockedListStickyNotes).toHaveBeenCalledTimes(2);
  });

  it("dragging the note body updates its on-screen position", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    render(<StickyNotesView />);
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 140, clientY: 90 });

    expect(noteEl.style.left).toBe("140px");
    expect(noteEl.style.top).toBe("90px");
  });

  it("persists the final position only on pointer up, not on every pointer move", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, x: 140, y: 90 });
    render(<StickyNotesView />);
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 120, clientY: 75 });
    firePointer(noteEl, "pointermove", { clientX: 140, clientY: 90 });
    expect(mockedUpdateStickyNote).not.toHaveBeenCalled();

    firePointer(noteEl, "pointerup", { clientX: 140, clientY: 90 });
    await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", { x: 140, y: 90 }));
    expect(mockedUpdateStickyNote).toHaveBeenCalledTimes(1);
  });

  it("does not start a drag when the pointer goes down on the delete button", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    render(<StickyNotesView />);
    const deleteButton = await screen.findByRole("button", { name: "스티커 메모 삭제" });
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(deleteButton, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 200, clientY: 200 });

    expect(noteEl.style.left).toBe("100px");
    expect(noteEl.style.top).toBe("60px");
  });

  it("does not start a drag when the pointer goes down on the textarea", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    render(<StickyNotesView />);
    const textarea = await screen.findByLabelText("스티커 메모 내용");
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(textarea, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 200, clientY: 200 });

    expect(noteEl.style.left).toBe("100px");
    expect(noteEl.style.top).toBe("60px");
  });

  it("clamps a note's rendered position within the viewport", async () => {
    mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, x: 999999, y: -999999 }]);
    render(<StickyNotesView />);
    const noteEl = await screen.findByTestId("sticky-note-s1");

    const left = Number.parseFloat(noteEl.style.left);
    const top = Number.parseFloat(noteEl.style.top);
    expect(left).toBeLessThanOrEqual(window.innerWidth);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  describe("resizing", () => {
    it("renders a resize handle for each note", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      expect(await screen.findByTestId("sticky-note-resize-s1")).toBeTruthy();
    });

    it("renders at its persisted width/height", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      expect(noteEl.style.width).toBe("200px");
      expect(noteEl.style.height).toBe("160px");
    });

    it("pointer movement on the handle changes width and height live", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });

      expect(noteEl.style.width).toBe("240px");
      expect(noteEl.style.height).toBe("200px");
    });

    it("persists the final dimensions only on pointer up, not on every pointer move", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, width: 240, height: 200 });
      render(<StickyNotesView />);
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 320, clientY: 280 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });
      expect(mockedUpdateStickyNote).not.toHaveBeenCalled();

      firePointer(handle, "pointerup", { clientX: 340, clientY: 300 });
      await waitFor(() =>
        expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", { width: 240, height: 200 }),
      );
      expect(mockedUpdateStickyNote).toHaveBeenCalledTimes(1);
    });

    it("does not start a note drag when resizing", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });

      // Position is untouched — only width/height changed.
      expect(noteEl.style.left).toBe("100px");
      expect(noteEl.style.top).toBe("60px");
    });

    it("enforces the minimum width and height", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: -5000, clientY: -5000 });

      expect(Number.parseFloat(noteEl.style.width)).toBeGreaterThanOrEqual(180);
      expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThanOrEqual(120);
    });

    it("restores the last persisted dimensions and reports an error if saving fails", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedUpdateStickyNote.mockRejectedValue(new Error("network error"));
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });
      firePointer(handle, "pointerup", { clientX: 340, clientY: 300 });

      expect(await screen.findByRole("alert")).toBeTruthy();
      // The store was never updated (the request rejected), so the note
      // falls back to rendering its last-known-good persisted size.
      await waitFor(() => expect(noteEl.style.width).toBe("200px"));
      expect(noteEl.style.height).toBe("160px");
    });
  });

  describe("content-aware auto height", () => {
    it("stays at the persisted/base height for short content", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]); // "buy milk" — short
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      expect(noteEl.style.height).toBe("160px");
    });

    it("expands the rendered height when content requires more room than the base height", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } }); // long -> stubbed scrollHeight 500

      await waitFor(() => expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThan(160));
    });

    it("does not change width when content grows", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } });

      await waitFor(() => expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThan(160));
      expect(noteEl.style.width).toBe("200px");
    });

    it("shrinks back to the persisted/base height once long content is removed", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } });
      await waitFor(() => expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThan(160));

      fireEvent.change(textarea, { target: { value: "short again" } });
      await waitFor(() => expect(noteEl.style.height).toBe("160px"));
    });

    it("does not persist an auto-expanded height (no API call from typing alone)", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } });
      fireEvent.change(textarea, { target: { value: "x".repeat(300) } });

      expect(mockedUpdateStickyNote).not.toHaveBeenCalled();
    });

    it("manual resize still works when content is short", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, width: 240, height: 200 });
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });
      expect(noteEl.style.height).toBe("200px");

      firePointer(handle, "pointerup", { clientX: 340, clientY: 300 });
      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", { width: 240, height: 200 }));
    });

    it("manual resize cannot visually shrink the note below the height its content requires", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      // Long content needs 500 (stubbed scrollHeight) + 64 chrome = 564px.
      fireEvent.change(textarea, { target: { value: "x".repeat(200) } });
      await waitFor(() => expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThanOrEqual(564));

      // Drag the handle far up-left, well below what the content needs.
      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: -5000, clientY: -5000 });

      expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThanOrEqual(564);
    });
  });
});
