import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StickyNotesView } from "../notebook/StickyNotesView";
import { createStickyNote, deleteStickyNote, listStickyNotes, updateStickyNote } from "../api/client";
import type { PlayerSession } from "../player/usePlayerSession";

// No board to collide with unless a test explicitly renders one and points
// this at it — jsdom's real getBoundingClientRect() always reports zeros
// anyway, so an unset ref (never attached to a rendered node) keeps
// collision detection a no-op for every test that isn't about it.
const boardRef = createRef<HTMLDivElement>();

// A stable, already-set player identity — most tests aren't about the
// nickname gate itself, just about Sticky Notes once a player exists.
const testSession: PlayerSession = {
  playerId: "player-1",
  nickname: "Tester",
  submitting: false,
  error: null,
  setNickname: vi.fn(),
  clearPlayer: vi.fn(),
};

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
  playerId: "player-1",
  content: "buy milk",
  color: "yellow" as const,
  pinned: false,
  locked: false,
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
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    expect(await screen.findByText(/아직 스티커 메모가 없습니다/)).toBeTruthy();
  });

  it("creates a sticky note with a valid initial position when '+ 새 스티커' is clicked", async () => {
    mockedListStickyNotes.mockResolvedValue([]);
    mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, content: "" });

    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
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
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

    const noteEl = await screen.findByTestId("sticky-note-s1");
    expect(noteEl.style.left).toBe("100px");
    expect(noteEl.style.top).toBe("60px");
  });

  it("saves edited content on blur", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, content: "buy bread" });

    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    const textarea = await screen.findByLabelText("스티커 메모 내용");
    fireEvent.change(textarea, { target: { value: "buy bread" } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { content: "buy bread" }));
  });

  it("changes color via a swatch button", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, color: "blue" });

    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    fireEvent.click(await screen.findByRole("button", { name: "파랑으로 변경" }));

    await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { color: "blue" }));
  });

  it("deletes a sticky note", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedDeleteStickyNote.mockResolvedValue(undefined);

    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    fireEvent.click(await screen.findByRole("button", { name: "스티커 메모 삭제" }));

    await waitFor(() => expect(mockedDeleteStickyNote).toHaveBeenCalledWith("s1", "player-1"));
  });

  it("surfaces an error state (not a crash) when an update is rejected", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockRejectedValue(new Error("not found"));

    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    fireEvent.click(await screen.findByRole("button", { name: "📌 고정" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("persists across a fresh mount (fetches from the server, not local memory)", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    const { unmount } = render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    await screen.findByDisplayValue("buy milk");
    unmount();

    mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "buy milk" }]);
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    expect(await screen.findByDisplayValue("buy milk")).toBeTruthy();
    expect(mockedListStickyNotes).toHaveBeenCalledTimes(2);
  });

  it("dragging the note body updates its on-screen position", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 140, clientY: 90 });

    expect(noteEl.style.left).toBe("140px");
    expect(noteEl.style.top).toBe("90px");
  });

  it("persists the final position only on pointer up, not on every pointer move", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, x: 140, y: 90 });
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 120, clientY: 75 });
    firePointer(noteEl, "pointermove", { clientX: 140, clientY: 90 });
    expect(mockedUpdateStickyNote).not.toHaveBeenCalled();

    firePointer(noteEl, "pointerup", { clientX: 140, clientY: 90 });
    await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { x: 140, y: 90 }));
    expect(mockedUpdateStickyNote).toHaveBeenCalledTimes(1);
  });

  it("does not start a drag when the pointer goes down on the delete button", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    const deleteButton = await screen.findByRole("button", { name: "스티커 메모 삭제" });
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(deleteButton, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 200, clientY: 200 });

    expect(noteEl.style.left).toBe("100px");
    expect(noteEl.style.top).toBe("60px");
  });

  it("does not start a drag when the pointer goes down on the textarea", async () => {
    mockedListStickyNotes.mockResolvedValue([NOTE_A]);
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
    const textarea = await screen.findByLabelText("스티커 메모 내용");
    const noteEl = await screen.findByTestId("sticky-note-s1");

    firePointer(textarea, "pointerdown", { clientX: 100, clientY: 60 });
    firePointer(noteEl, "pointermove", { clientX: 200, clientY: 200 });

    expect(noteEl.style.left).toBe("100px");
    expect(noteEl.style.top).toBe("60px");
  });

  it("clamps a note's rendered position within the viewport", async () => {
    mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, x: 999999, y: -999999 }]);
    render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
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
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      expect(await screen.findByTestId("sticky-note-resize-s1")).toBeTruthy();
    });

    it("renders at its persisted width/height", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      expect(noteEl.style.width).toBe("200px");
      expect(noteEl.style.height).toBe("160px");
    });

    it("pointer movement on the handle changes width and height live", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
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
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 320, clientY: 280 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });
      expect(mockedUpdateStickyNote).not.toHaveBeenCalled();

      firePointer(handle, "pointerup", { clientX: 340, clientY: 300 });
      await waitFor(() =>
        expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { width: 240, height: 200 }),
      );
      expect(mockedUpdateStickyNote).toHaveBeenCalledTimes(1);
    });

    it("does not start a note drag when resizing", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
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
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
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
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
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
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      expect(noteEl.style.height).toBe("160px");
    });

    it("expands the rendered height when content requires more room than the base height", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } }); // long -> stubbed scrollHeight 500

      await waitFor(() => expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThan(160));
    });

    it("does not change width when content grows", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } });

      await waitFor(() => expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThan(160));
      expect(noteEl.style.width).toBe("200px");
    });

    it("shrinks back to the persisted/base height once long content is removed", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } });
      await waitFor(() => expect(Number.parseFloat(noteEl.style.height)).toBeGreaterThan(160));

      fireEvent.change(textarea, { target: { value: "short again" } });
      await waitFor(() => expect(noteEl.style.height).toBe("160px"));
    });

    it("does not persist an auto-expanded height (no API call from typing alone)", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      fireEvent.change(textarea, { target: { value: "x".repeat(200) } });
      fireEvent.change(textarea, { target: { value: "x".repeat(300) } });

      expect(mockedUpdateStickyNote).not.toHaveBeenCalled();
    });

    it("manual resize still works when content is short", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, width: 240, height: 200 });
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });
      expect(noteEl.style.height).toBe("200px");

      firePointer(handle, "pointerup", { clientX: 340, clientY: 300 });
      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { width: 240, height: 200 }));
    });

    it("manual resize cannot visually shrink the note below the height its content requires", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
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

  describe("고정 (lock) toggle", () => {
    it("does not render a padlock icon", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-s1");

      expect(screen.queryByText("🔒")).toBeNull();
      expect(screen.queryByText("🔓")).toBeNull();
    });

    it("renders exactly one 📌 고정 control", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      expect(await screen.findAllByRole("button", { name: "📌 고정" })).toHaveLength(1);
    });

    it("a new sticky note defaults to locked = false (고정 inactive)", async () => {
      mockedListStickyNotes.mockResolvedValue([]);
      mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, content: "" });

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByText(/아직 스티커 메모가 없습니다/);
      fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));

      await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalled());
      // The create payload never sends `locked` — the DB column default (false) governs new notes.
      expect(mockedCreateStickyNote.mock.calls[0][0]).not.toHaveProperty("locked");
      const toggle = await screen.findByRole("button", { name: "📌 고정" });
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });

    it("clicking 📌 고정 changes unlocked -> fixed", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, locked: true });

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      fireEvent.click(await screen.findByRole("button", { name: "📌 고정" }));

      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { locked: true }));
    });

    it("clicking 📌 고정 again changes fixed -> unlocked", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: true }]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, locked: false });

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      fireEvent.click(await screen.findByRole("button", { name: "📌 고정" }));

      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { locked: false }));
    });

    it("the fixed state is visually indicated via aria-pressed", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: true }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const toggle = await screen.findByRole("button", { name: "📌 고정" });
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    });

    it("persists the fixed state through the API (survives a fresh mount / refetch)", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: true }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const toggle = await screen.findByRole("button", { name: "📌 고정" });
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(mockedListStickyNotes).toHaveBeenCalledTimes(1);
    });

    it("a fixed note cannot start dragging", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: true }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");

      firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 140, clientY: 90 });

      // Remains exactly at its persisted x/y.
      expect(noteEl.style.left).toBe("100px");
      expect(noteEl.style.top).toBe("60px");
    });

    it("a fixed note cannot start resizing", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: true }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });

      expect(noteEl.style.width).toBe("200px");
      expect(noteEl.style.height).toBe("160px");
    });

    it("a fixed note can still have its content edited", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: true }]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, locked: true, content: "still editable" });

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = await screen.findByLabelText("스티커 메모 내용");
      fireEvent.change(textarea, { target: { value: "still editable" } });
      fireEvent.blur(textarea);

      await waitFor(() =>
        expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { content: "still editable" }),
      );
    });

    it("📌 고정 remains clickable while fixed", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: true }]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, locked: false });
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      fireEvent.click(await screen.findByRole("button", { name: "📌 고정" }));
      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { locked: false }));
    });

    it("clicking 📌 고정 never starts a drag", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const toggle = await screen.findByRole("button", { name: "📌 고정" });

      firePointer(toggle, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 200, clientY: 200 });

      expect(noteEl.style.left).toBe("100px");
      expect(noteEl.style.top).toBe("60px");
    });

    it("clicking 📌 고정 never starts a resize", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const toggle = await screen.findByRole("button", { name: "📌 고정" });

      firePointer(toggle, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 400, clientY: 400 });

      expect(noteEl.style.width).toBe("200px");
      expect(noteEl.style.height).toBe("160px");
    });

    it("unlocking restores existing drag behavior", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: false }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");

      firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 140, clientY: 90 });

      expect(noteEl.style.left).toBe("140px");
      expect(noteEl.style.top).toBe("90px");
    });

    it("unlocking restores existing resize behavior", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, locked: false }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 260 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 300 });

      expect(noteEl.style.width).toBe("240px");
      expect(noteEl.style.height).toBe("200px");
    });
  });

  describe("auto height: overflow-triggered expansion, not continuous growth", () => {
    // Base height 240, chrome 64 -> available content room = 176px.
    const BASE_NOTE = { ...NOTE_A, height: 240 };

    function stubScrollHeightValue(value: number) {
      Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
        configurable: true,
        get: () => value,
      });
    }

    it("stays at the base height while content is well below the available area", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(100);
      fireEvent.change(textarea, { target: { value: "some content" } });
      await waitFor(() => expect(noteEl.style.height).toBe("240px"));
    });

    it("stays at the base height right up to the boundary (content == available height)", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(176); // exactly the available room (240 - 64)
      fireEvent.change(textarea, { target: { value: "boundary content" } });
      await waitFor(() => expect(noteEl.style.height).toBe("240px"));
    });

    it("expands as soon as content exceeds the available height by even one pixel", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(177); // one pixel past the 176px available room
      fireEvent.change(textarea, { target: { value: "just over the line" } });
      await waitFor(() => expect(noteEl.style.height).toBe("241px")); // 177 + 64 chrome
    });

    it("remains large enough to show further content without clipping", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(300);
      fireEvent.change(textarea, { target: { value: "x".repeat(400) } });
      await waitFor(() => expect(noteEl.style.height).toBe("364px")); // 300 + 64 chrome
    });

    it("returns to the base height once content is deleted back under the boundary", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(300);
      fireEvent.change(textarea, { target: { value: "x".repeat(400) } });
      await waitFor(() => expect(noteEl.style.height).toBe("364px"));

      stubScrollHeightValue(50);
      fireEvent.change(textarea, { target: { value: "short" } });
      await waitFor(() => expect(noteEl.style.height).toBe("240px"));
    });

    it("never changes width, whether content fits or overflows", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(300);
      fireEvent.change(textarea, { target: { value: "x".repeat(400) } });
      await waitFor(() => expect(noteEl.style.height).toBe("364px"));
      expect(noteEl.style.width).toBe("200px");
    });

    it("never sends a persistence request purely from an overflow-triggered expansion", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(300);
      fireEvent.change(textarea, { target: { value: "x".repeat(400) } });
      await waitFor(() => expect(screen.getByTestId("sticky-note-s1").style.height).toBe("364px"));

      expect(mockedUpdateStickyNote).not.toHaveBeenCalled();
    });

    it("manual resize still updates the persisted base height that auto height expands from", async () => {
      mockedListStickyNotes.mockResolvedValue([BASE_NOTE]);
      mockedUpdateStickyNote.mockResolvedValue({ ...BASE_NOTE, width: 240, height: 280 });
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const handle = await screen.findByTestId("sticky-note-resize-s1");

      firePointer(handle, "pointerdown", { clientX: 300, clientY: 340 });
      firePointer(handle, "pointermove", { clientX: 340, clientY: 380 });
      firePointer(handle, "pointerup", { clientX: 340, clientY: 380 });

      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { width: 240, height: 280 }));
    });

    it("auto height still expands for overflowing content while the note is locked", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...BASE_NOTE, locked: true }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = await screen.findByLabelText("스티커 메모 내용");

      stubScrollHeightValue(300);
      fireEvent.change(textarea, { target: { value: "x".repeat(400) } });
      await waitFor(() => expect(noteEl.style.height).toBe("364px"));
    });
  });

  describe("Main Board collision", () => {
    function renderWithBoard(notes: (typeof NOTE_A)[] = [NOTE_A]) {
      mockedListStickyNotes.mockResolvedValue(notes);
      const ref = createRef<HTMLDivElement>();
      render(
        <>
          <div ref={ref} data-testid="board" />
          <StickyNotesView active boardRef={ref} session={testSession} />
        </>,
      );
      return ref;
    }

    function stubBoardRect(
      ref: React.RefObject<HTMLDivElement>,
      rect: { left: number; top: number; width: number; height: number },
    ) {
      if (!ref.current) {
        throw new Error("board ref not mounted");
      }
      ref.current.getBoundingClientRect = () =>
        ({
          ...rect,
          right: rect.left + rect.width,
          bottom: rect.top + rect.height,
          x: rect.left,
          y: rect.top,
          toJSON() {
            return this;
          },
        }) as DOMRect;
    }

    it("blocks a drag the instant it would enter the Main Board's real bounding rect", async () => {
      const ref = renderWithBoard();
      const noteEl = await screen.findByTestId("sticky-note-s1");
      // Note starts at (100,60), 200x160 (short content -> renderHeight stays 160).
      stubBoardRect(ref, { left: 300, top: 300, width: 200, height: 200 });

      firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
      // Candidate would land at (350,310), 200x160 -> overlaps [300,500]x[300,500].
      firePointer(noteEl, "pointermove", { clientX: 350, clientY: 310 });

      expect(noteEl.style.left).toBe("100px");
      expect(noteEl.style.top).toBe("60px");
      expect(await screen.findByTestId("sticky-note-blocked-s1")).toBeTruthy();
    });

    it("keeps the note at its last valid position on release — no snap-back", async () => {
      const ref = renderWithBoard();
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, x: 120, y: 80 });
      const noteEl = await screen.findByTestId("sticky-note-s1");
      stubBoardRect(ref, { left: 300, top: 300, width: 200, height: 200 });

      firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 120, clientY: 80 }); // valid, no overlap
      firePointer(noteEl, "pointermove", { clientX: 350, clientY: 310 }); // blocked, ignored
      expect(noteEl.style.left).toBe("120px"); // frozen at the last valid position, not moved back or forward

      firePointer(noteEl, "pointerup", { clientX: 350, clientY: 310 });
      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { x: 120, y: 80 }));
    });

    it("resumes normal movement once the candidate clears the board again", async () => {
      const ref = renderWithBoard();
      const noteEl = await screen.findByTestId("sticky-note-s1");
      stubBoardRect(ref, { left: 300, top: 300, width: 200, height: 200 });

      firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 350, clientY: 310 }); // blocked
      firePointer(noteEl, "pointermove", { clientX: 130, clientY: 90 }); // clear again

      expect(noteEl.style.left).toBe("130px");
      expect(noteEl.style.top).toBe("90px");
      expect(screen.queryByTestId("sticky-note-blocked-s1")).toBeNull();
    });

    it("uses the note's actual current width/height, not a hardcoded footprint", async () => {
      const ref = renderWithBoard([{ ...NOTE_A, width: 400, height: 300 }]);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      stubBoardRect(ref, { left: 300, top: 300, width: 200, height: 200 });

      // Even a tiny move already collides because this note's larger 400x300
      // footprint reaches into the board's rect from its starting position.
      firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 105, clientY: 65 });

      expect(noteEl.style.left).toBe("100px");
      expect(noteEl.style.top).toBe("60px");
      expect(await screen.findByTestId("sticky-note-blocked-s1")).toBeTruthy();
    });

    it("does not block a drag when there is no board rect to collide with", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      const emptyRef = createRef<HTMLDivElement>(); // never attached to a rendered node
      render(<StickyNotesView active boardRef={emptyRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");

      firePointer(noteEl, "pointerdown", { clientX: 100, clientY: 60 });
      firePointer(noteEl, "pointermove", { clientX: 500, clientY: 500 });

      expect(noteEl.style.left).toBe("500px");
      expect(noteEl.style.top).toBe("500px");
    });
  });

  describe("persistence across view/tool switching", () => {
    it("never refetches or unmounts notes when the panel toggles inactive and active again", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      const { rerender } = render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-s1");
      expect(mockedListStickyNotes).toHaveBeenCalledTimes(1);

      // Simulates switching to another tab: only the panel disappears.
      rerender(<StickyNotesView active={false} boardRef={boardRef} session={testSession} />);
      expect(screen.getByTestId("sticky-note-s1")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "+ 새 스티커" })).toBeNull();

      // Simulates switching back: the same note, no new fetch.
      rerender(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      expect(screen.getByTestId("sticky-note-s1")).toBeTruthy();
      expect(mockedListStickyNotes).toHaveBeenCalledTimes(1);
    });

    it("retains id/content/position/size/locked exactly across the toggle", async () => {
      const note = { ...NOTE_A, content: "keep me", locked: true, x: 111, y: 22, width: 210, height: 170 };
      mockedListStickyNotes.mockResolvedValue([note]);
      const { rerender } = render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-s1");

      rerender(<StickyNotesView active={false} boardRef={boardRef} session={testSession} />);
      rerender(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const noteEl = screen.getByTestId("sticky-note-s1");
      expect(noteEl.style.left).toBe("111px");
      expect(noteEl.style.top).toBe("22px");
      expect(noteEl.style.width).toBe("210px");
      expect((screen.getByLabelText("스티커 메모 내용") as HTMLTextAreaElement).value).toBe("keep me");
      expect(screen.getByRole("button", { name: "📌 고정" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("a note is removed from the DOM only by an explicit delete, never by toggling active", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      const { rerender } = render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-s1");

      rerender(<StickyNotesView active={false} boardRef={boardRef} session={testSession} />);
      rerender(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      rerender(<StickyNotesView active={false} boardRef={boardRef} session={testSession} />);
      rerender(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      expect(screen.getByTestId("sticky-note-s1")).toBeTruthy();
      expect(mockedDeleteStickyNote).not.toHaveBeenCalled();
    });
  });

  describe("player scoping (browser/player-level ownership, not authentication)", () => {
    it("shows a nickname prompt instead of the panel when no playerId exists yet", async () => {
      mockedListStickyNotes.mockResolvedValue([]);
      const noSession: PlayerSession = { ...testSession, playerId: null, nickname: null };
      render(<StickyNotesView active boardRef={boardRef} session={noSession} />);

      expect(await screen.findByPlaceholderText("Your nickname")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "+ 새 스티커" })).toBeNull();
      expect(mockedListStickyNotes).not.toHaveBeenCalled();
    });

    it("requests notes scoped to the current playerId", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      await screen.findByTestId("sticky-note-s1");
      expect(mockedListStickyNotes).toHaveBeenCalledWith("player-1");
    });

    it("sends the current playerId on create/update/delete", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, content: "x" });
      mockedDeleteStickyNote.mockResolvedValue(undefined);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const textarea = await screen.findByLabelText("스티커 메모 내용");
      fireEvent.change(textarea, { target: { value: "x" } });
      fireEvent.blur(textarea);
      await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { content: "x" }));

      fireEvent.click(screen.getByRole("button", { name: "스티커 메모 삭제" }));
      await waitFor(() => expect(mockedDeleteStickyNote).toHaveBeenCalledWith("s1", "player-1"));
    });

    it("refetches and shows only the new player's notes after switching players", async () => {
      mockedListStickyNotes.mockResolvedValueOnce([NOTE_A]);
      const { rerender } = render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-s1");

      const otherPlayerNote = { ...NOTE_A, id: "s2", playerId: "player-2", content: "player 2's note" };
      mockedListStickyNotes.mockResolvedValueOnce([otherPlayerNote]);
      const otherSession: PlayerSession = { ...testSession, playerId: "player-2", nickname: "Other" };
      rerender(<StickyNotesView active boardRef={boardRef} session={otherSession} />);

      await waitFor(() => expect(screen.queryByTestId("sticky-note-s1")).toBeNull());
      expect(await screen.findByTestId("sticky-note-s2")).toBeTruthy();
      expect(mockedListStickyNotes).toHaveBeenCalledWith("player-2");
    });
  });

  describe("collision-aware random spawn position", () => {
    function stubBoardRect(
      ref: React.RefObject<HTMLDivElement>,
      rect: { left: number; top: number; width: number; height: number },
    ) {
      if (!ref.current) {
        throw new Error("board ref not mounted");
      }
      ref.current.getBoundingClientRect = () =>
        ({
          ...rect,
          right: rect.left + rect.width,
          bottom: rect.top + rect.height,
          x: rect.left,
          y: rect.top,
          toJSON() {
            return this;
          },
        }) as DOMRect;
    }

    it("creating multiple notes produces varied positions", async () => {
      mockedListStickyNotes.mockResolvedValue([]);
      let nextId = 1;
      mockedCreateStickyNote.mockImplementation(async (input) => ({
        ...NOTE_A,
        id: `new-${nextId++}`,
        x: input.x ?? 0,
        y: input.y ?? 0,
      }));

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByText(/아직 스티커 메모가 없습니다/);
      const createButton = screen.getByRole("button", { name: "+ 새 스티커" });

      for (let i = 0; i < 5; i++) {
        fireEvent.click(createButton);
        await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalledTimes(i + 1));
      }

      const positions = new Set(
        mockedCreateStickyNote.mock.calls.map((call) => `${call[0].x},${call[0].y}`),
      );
      expect(positions.size).toBeGreaterThan(1);
    });

    it("a newly created note never overlaps an existing note", async () => {
      const existing = { ...NOTE_A, x: 100, y: 100, width: 200, height: 160 };
      mockedListStickyNotes.mockResolvedValue([existing]);
      mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, id: "new-1", x: 0, y: 0 });

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-s1");
      fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));

      await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalled());
      const { x, y } = mockedCreateStickyNote.mock.calls[0][0];
      const noOverlap = x! + 200 <= existing.x || existing.x + existing.width <= x! || y! + 160 <= existing.y ||
        existing.y + existing.height <= y!;
      expect(noOverlap).toBe(true);
    });

    it("a newly created note never overlaps the Main Board", async () => {
      mockedListStickyNotes.mockResolvedValue([]);
      mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, id: "new-1", x: 0, y: 0 });
      const ref = createRef<HTMLDivElement>();
      render(
        <>
          <div ref={ref} data-testid="board" />
          <StickyNotesView active boardRef={ref} session={testSession} />
        </>,
      );
      await screen.findByText(/아직 스티커 메모가 없습니다/);
      // Board occupies most of the viewport but leaves a genuinely wide
      // enough clear strip (324px right, well over the 200px note width).
      stubBoardRect(ref, { left: 0, top: 0, width: 700, height: 768 });

      fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));
      await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalled());

      const { x, y } = mockedCreateStickyNote.mock.calls[0][0];
      const board = { x: 0, y: 0, width: 700, height: 768 };
      const noOverlap = x! + 200 <= board.x || board.x + board.width <= x! || y! + 160 <= board.y ||
        board.y + board.height <= y!;
      expect(noOverlap).toBe(true);
    });

    it("can still create a note when an existing note is locked at the default spawn location", async () => {
      const lockedAtDefault = { ...NOTE_A, id: "locked-1", x: 24, y: 24, width: 200, height: 160, locked: true };
      mockedListStickyNotes.mockResolvedValue([lockedAtDefault]);
      mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, id: "new-1", x: 500, y: 500 });

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-locked-1");
      fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));

      await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalled());
      const { x, y } = mockedCreateStickyNote.mock.calls[0][0];
      const noOverlap =
        x! + 200 <= lockedAtDefault.x ||
        lockedAtDefault.x + lockedAtDefault.width <= x! ||
        y! + 160 <= lockedAtDefault.y ||
        lockedAtDefault.y + lockedAtDefault.height <= y!;
      expect(noOverlap).toBe(true);
    });

    it("existing notes never move as a side effect of creating another note", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, id: "new-1", x: 500, y: 500 });

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const existingEl = await screen.findByTestId("sticky-note-s1");
      expect(existingEl.style.left).toBe("100px");
      expect(existingEl.style.top).toBe("60px");

      fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));
      await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalled());

      expect(mockedUpdatePositionCallsFor("s1")).toHaveLength(0);
      expect(screen.getByTestId("sticky-note-s1").style.left).toBe("100px");
      expect(screen.getByTestId("sticky-note-s1").style.top).toBe("60px");

      function mockedUpdatePositionCallsFor(id: string) {
        return mockedUpdateStickyNote.mock.calls.filter((call) => call[0] === id);
      }
    });

    it("fails gracefully with an error message instead of creating an overlapping note when no space is left", async () => {
      // Tile the entire viewport with existing notes so nothing fits.
      const jammedNotes = [];
      for (let y = 0; y < 768; y += 160) {
        for (let x = 0; x < 1024; x += 200) {
          jammedNotes.push({ ...NOTE_A, id: `n-${x}-${y}`, x, y, width: 200, height: 160 });
        }
      }
      mockedListStickyNotes.mockResolvedValue(jammedNotes);

      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId(`sticky-note-${jammedNotes[0].id}`);
      fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));

      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(mockedCreateStickyNote).not.toHaveBeenCalled();
    });
  });

  describe("rich text formatting", () => {
    function setSelection(el: HTMLTextAreaElement, start: number, end: number) {
      el.selectionStart = start;
      el.selectionEnd = end;
    }

    it("toggles bold with Ctrl+B on the current selection", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello world" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;

      setSelection(textarea, 0, 5);
      fireEvent.keyDown(textarea, { key: "b", ctrlKey: true });

      expect(textarea.value).toBe("**hello** world");
    });

    it("toggles italic with Ctrl+I on the current selection", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello world" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;

      setSelection(textarea, 6, 11);
      fireEvent.keyDown(textarea, { key: "i", ctrlKey: true });

      expect(textarea.value).toBe("hello _world_");
    });

    it("toggles strikethrough with Ctrl+X on the current selection", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello world" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;

      setSelection(textarea, 0, 11);
      fireEvent.keyDown(textarea, { key: "x", ctrlKey: true });

      expect(textarea.value).toBe("~~hello world~~");
    });

    it("Ctrl+X does not cut/delete the selected text — it wraps it instead", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello world" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;

      setSelection(textarea, 0, 11);
      const notCancelled = fireEvent.keyDown(textarea, { key: "x", ctrlKey: true });

      // fireEvent's return value is false when preventDefault() was called.
      expect(notCancelled).toBe(false);
      expect(textarea.value).toContain("hello world");
    });

    it("a plain Ctrl+X with no other formatting context is still intercepted as strikethrough inside the editor", async () => {
      // Within the Sticky Note content editor, Ctrl+X is always the
      // strikethrough shortcut — there is no separate "just cut" mode to
      // distinguish here; native cut is only preserved outside this editor.
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "abc" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;
      setSelection(textarea, 0, 3);

      fireEvent.keyDown(textarea, { key: "x", ctrlKey: true });
      expect(textarea.value).toBe("~~abc~~");
    });

    it("combines bold, italic, and strikethrough on the same text", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;

      setSelection(textarea, 0, 5);
      fireEvent.keyDown(textarea, { key: "b", ctrlKey: true });
      fireEvent.keyDown(textarea, { key: "i", ctrlKey: true });
      fireEvent.keyDown(textarea, { key: "x", ctrlKey: true });

      expect(textarea.value).toBe("**_~~hello~~_**");
    });

    it("toolbar buttons apply the same formatting without losing the selection", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello world" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;
      setSelection(textarea, 0, 5);

      fireEvent.click(screen.getByRole("button", { name: "굵게" }));

      expect(textarea.value).toBe("**hello** world");
    });

    it("does not start a drag when a formatting shortcut is used", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;
      setSelection(textarea, 0, 5);

      fireEvent.keyDown(textarea, { key: "b", ctrlKey: true });

      expect(noteEl.style.left).toBe("100px");
      expect(noteEl.style.top).toBe("60px");
    });

    it("does not toggle formatting when Ctrl+B is dispatched outside the content editor", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const noteEl = await screen.findByTestId("sticky-note-s1");

      fireEvent.keyDown(noteEl, { key: "b", ctrlKey: true });

      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;
      expect(textarea.value).toBe("hello");
    });

    it("persists formatted content through the existing save path on blur", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "hello world" }]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, content: "**hello** world" });
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;

      setSelection(textarea, 0, 5);
      fireEvent.keyDown(textarea, { key: "b", ctrlKey: true });
      fireEvent.blur(textarea);

      await waitFor(() =>
        expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { content: "**hello** world" }),
      );
    });

    it("renders formatting in the read-only preview once persisted, e.g. after a remount/refetch", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "**bold** and _italic_ and ~~strike~~" }]);
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const preview = await screen.findByTestId("sticky-note-preview-s1");
      expect(preview.querySelector("strong")?.textContent).toBe("bold");
      expect(preview.querySelector("em")?.textContent).toBe("italic");
      expect(preview.querySelector("s")?.textContent).toBe("strike");
    });

    it("remains correctly formatted after switching views and back (remount preserves the persisted markers)", async () => {
      mockedListStickyNotes.mockResolvedValue([{ ...NOTE_A, content: "**bold**" }]);
      const { rerender } = render(<StickyNotesView active boardRef={boardRef} session={testSession} />);
      await screen.findByTestId("sticky-note-preview-s1");

      rerender(<StickyNotesView active={false} boardRef={boardRef} session={testSession} />);
      rerender(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const preview = await screen.findByTestId("sticky-note-preview-s1");
      expect(preview.querySelector("strong")?.textContent).toBe("bold");
    });

    it("existing plain-text notes with no formatting markers remain fully compatible", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]); // "buy milk", no markers
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const preview = await screen.findByTestId("sticky-note-preview-s1");
      expect(preview.textContent).toBe("buy milk");
      expect(preview.querySelector("strong, em, s")).toBeNull();

      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;
      expect(textarea.value).toBe("buy milk");
    });

    it("becomes typeable after clicking the read-only preview (regression: preview overlay must not leave the textarea unfocusable)", async () => {
      mockedListStickyNotes.mockResolvedValue([NOTE_A]);
      mockedUpdateStickyNote.mockResolvedValue({ ...NOTE_A, content: "buy milk and eggs" });
      render(<StickyNotesView active boardRef={boardRef} session={testSession} />);

      const preview = await screen.findByTestId("sticky-note-preview-s1");
      fireEvent.click(preview);

      const textarea = (await screen.findByLabelText("스티커 메모 내용")) as HTMLTextAreaElement;
      expect(document.activeElement).toBe(textarea);

      fireEvent.change(textarea, { target: { value: "buy milk and eggs" } });
      expect(textarea.value).toBe("buy milk and eggs");

      fireEvent.blur(textarea);
      await waitFor(() =>
        expect(mockedUpdateStickyNote).toHaveBeenCalledWith("s1", "player-1", { content: "buy milk and eggs" }),
      );
    });
  });
});
