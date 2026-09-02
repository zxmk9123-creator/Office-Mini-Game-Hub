import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NicknameEntry } from "../player/NicknameEntry";
import type { PlayerSession } from "../player/usePlayerSession";

function makeSession(overrides: Partial<PlayerSession> = {}): PlayerSession {
  return {
    playerId: null,
    nickname: null,
    submitting: false,
    error: null,
    setNickname: vi.fn(),
    clearPlayer: vi.fn(),
    ...overrides,
  };
}

describe("NicknameEntry", () => {
  it("auto-focuses the nickname input", () => {
    render(<NicknameEntry session={makeSession()} />);
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Your nickname"));
  });

  it("disables Start until something is typed", () => {
    render(<NicknameEntry session={makeSession()} />);
    expect((screen.getByRole("button", { name: "Start" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the typed nickname via session.setNickname on Start click", () => {
    const setNickname = vi.fn();
    render(<NicknameEntry session={makeSession({ setNickname })} />);

    fireEvent.change(screen.getByPlaceholderText("Your nickname"), { target: { value: "Sanghyun" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(setNickname).toHaveBeenCalledWith("Sanghyun");
  });

  it("submits on Enter within the form", () => {
    const setNickname = vi.fn();
    render(<NicknameEntry session={makeSession({ setNickname })} />);

    const input = screen.getByPlaceholderText("Your nickname");
    fireEvent.change(input, { target: { value: "Sanghyun" } });
    fireEvent.submit(input.closest("form")!);

    expect(setNickname).toHaveBeenCalledWith("Sanghyun");
  });

  it("shows the session's validation error", () => {
    render(<NicknameEntry session={makeSession({ error: "Enter a nickname to continue." })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Enter a nickname to continue\./);
  });

  it("disables the input and shows a pending label while submitting", () => {
    render(<NicknameEntry session={makeSession({ submitting: true })} />);
    expect((screen.getByPlaceholderText("Your nickname") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Starting…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
