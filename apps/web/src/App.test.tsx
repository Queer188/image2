import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the phase 0 workbench shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /image2 tool/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/phase 0 scaffold/i)).toBeInTheDocument();
  });
});
