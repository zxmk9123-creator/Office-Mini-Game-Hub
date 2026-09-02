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
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  mockedListStickyNotes.mockReset();
  mockedCreateStickyNote.mockReset();
  mockedUpdateStickyNote.mockReset();
  mockedDeleteStickyNote.mockReset();
});

describe("StickyNotesView", () => {
  it("shows a clean empty state when there are no sticky notes", async () => {
    mockedListStickyNotes.mockResolvedValue([]);
    render(<StickyNotesView />);
    expect(await screen.findByText(/아직 스티커 메모가 없습니다/)).toBeTruthy();
  });

  it("creates a sticky note when '+ 새 스티커' is clicked", async () => {
    mockedListStickyNotes.mockResolvedValue([]);
    mockedCreateStickyNote.mockResolvedValue({ ...NOTE_A, content: "" });

    render(<StickyNotesView />);
    await screen.findByText(/아직 스티커 메모가 없습니다/);
    fireEvent.click(screen.getByRole("button", { name: "+ 새 스티커" }));

    await waitFor(() => expect(mockedCreateStickyNote).toHaveBeenCalledWith({ content: "" }));
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
});
