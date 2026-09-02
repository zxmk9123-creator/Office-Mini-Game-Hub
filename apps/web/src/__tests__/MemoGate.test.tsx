import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoGate } from "../notebook/MemoGate";

describe("MemoGate", () => {
  it("shows the required question and an accessible, focused input", async () => {
    render(<MemoGate onUnlock={vi.fn()} />);

    expect(screen.getAllByText("사명을 입력하시오.").length).toBeGreaterThan(0);
    const input = screen.getByLabelText("사명을 입력하시오.");
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("button", { name: "확인" })).toBeTruthy();
  });

  it("rejects an incorrect answer, keeps the gate closed, and shows a clear error without revealing the answer", () => {
    const onUnlock = vi.fn();
    render(<MemoGate onUnlock={onUnlock} />);

    fireEvent.change(screen.getByLabelText("사명을 입력하시오."), { target: { value: "wrong answer" } });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(onUnlock).not.toHaveBeenCalled();
    const error = screen.getByRole("alert");
    expect(error.textContent).toContain("입력한 내용이 올바르지 않습니다");
    expect(error.textContent).not.toContain("강박여");
  });

  it("unlocks on the correct answer via the 확인 button", () => {
    const onUnlock = vi.fn();
    render(<MemoGate onUnlock={onUnlock} />);

    fireEvent.change(screen.getByLabelText("사명을 입력하시오."), { target: { value: "강박여" } });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("unlocks on the correct answer via pressing Enter (native form submit)", () => {
    const onUnlock = vi.fn();
    render(<MemoGate onUnlock={onUnlock} />);

    const input = screen.getByLabelText("사명을 입력하시오.");
    fireEvent.change(input, { target: { value: "강박여" } });
    fireEvent.submit(input.closest("form")!);

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("clears a previous error once the user starts typing again", () => {
    render(<MemoGate onUnlock={vi.fn()} />);
    const input = screen.getByLabelText("사명을 입력하시오.");

    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.change(input, { target: { value: "wrong2" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
