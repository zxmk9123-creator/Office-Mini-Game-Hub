import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesView } from "../notebook/NotesView";
import { createNote, deleteNote, listNotes, updateNote } from "../api/client";

vi.mock("../api/client", () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

const mockedListNotes = vi.mocked(listNotes);
const mockedCreateNote = vi.mocked(createNote);
const mockedUpdateNote = vi.mocked(updateNote);
const mockedDeleteNote = vi.mocked(deleteNote);

const NOTE_A = { id: "n1", title: "First", content: "hello", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

beforeEach(() => {
  mockedListNotes.mockReset();
  mockedCreateNote.mockReset();
  mockedUpdateNote.mockReset();
  mockedDeleteNote.mockReset();
});

describe("NotesView", () => {
  it("shows a clean empty state when there are no notes", async () => {
    mockedListNotes.mockResolvedValue([]);
    render(<NotesView />);
    expect(await screen.findByText(/아직 메모가 없습니다/)).toBeTruthy();
  });

  it("creates a note when '+ 새 메모' is clicked", async () => {
    mockedListNotes.mockResolvedValue([]);
    const created = { id: "n2", title: "", content: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
    mockedCreateNote.mockResolvedValue(created);

    render(<NotesView />);
    await screen.findByText(/아직 메모가 없습니다/);
    fireEvent.click(screen.getByRole("button", { name: "+ 새 메모" }));

    await waitFor(() => expect(mockedCreateNote).toHaveBeenCalledWith({ title: "", content: "" }));
    expect(await screen.findByLabelText("메모 제목")).toBeTruthy();
  });

  it("selects an existing note and shows it in the editor", async () => {
    mockedListNotes.mockResolvedValue([NOTE_A]);
    render(<NotesView />);

    fireEvent.click(await screen.findByText("First"));

    expect((await screen.findByLabelText("메모 제목")) as HTMLInputElement).toHaveProperty("value", "First");
    expect((screen.getByLabelText("메모 내용") as HTMLTextAreaElement).value).toBe("hello");
  });

  it("saves edits via updateNote and disables Save until something changes", async () => {
    mockedListNotes.mockResolvedValue([NOTE_A]);
    const updated = { ...NOTE_A, title: "Updated", updatedAt: "2026-01-02T00:00:00Z" };
    mockedUpdateNote.mockResolvedValue(updated);

    render(<NotesView />);
    fireEvent.click(await screen.findByText("First"));

    const saveButton = screen.getByRole("button", { name: "저장" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("메모 제목"), { target: { value: "Updated" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(saveButton);
    await waitFor(() => expect(mockedUpdateNote).toHaveBeenCalledWith("n1", { title: "Updated", content: "hello" }));
  });

  it("deletes a note", async () => {
    mockedListNotes.mockResolvedValue([NOTE_A]);
    mockedDeleteNote.mockResolvedValue(undefined);

    render(<NotesView />);
    fireEvent.click(await screen.findByText("First"));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(mockedDeleteNote).toHaveBeenCalledWith("n1"));
  });

  it("shows an error message instead of crashing when the notes request fails (e.g. a misrouted API response)", async () => {
    mockedListNotes.mockRejectedValue(new Error("not JSON"));
    render(<NotesView />);

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("메모를 불러오지 못했습니다"));
    // The rest of the panel (e.g. the "+ 새 메모" button) still rendered —
    // a failed fetch never leaves `notes` as something other than an array.
    expect(screen.getByRole("button", { name: "+ 새 메모" })).toBeTruthy();
  });
});
