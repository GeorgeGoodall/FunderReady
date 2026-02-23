import { describe, it, expect } from "vitest";
import { isDisposableEmail } from "../disposable-emails";

describe("isDisposableEmail", () => {
  it("rejects known disposable domains", () => {
    expect(isDisposableEmail("test@mailinator.com")).toBe(true);
    expect(isDisposableEmail("test@guerrillamail.com")).toBe(true);
    expect(isDisposableEmail("test@yopmail.com")).toBe(true);
    expect(isDisposableEmail("test@tempmail.com")).toBe(true);
    expect(isDisposableEmail("test@10minutemail.com")).toBe(true);
  });

  it("allows legitimate email domains", () => {
    expect(isDisposableEmail("user@gmail.com")).toBe(false);
    expect(isDisposableEmail("user@outlook.com")).toBe(false);
    expect(isDisposableEmail("user@company.co.uk")).toBe(false);
    expect(isDisposableEmail("user@university.ac.uk")).toBe(false);
  });

  it("is case-insensitive on domain", () => {
    expect(isDisposableEmail("test@MAILINATOR.COM")).toBe(true);
    expect(isDisposableEmail("test@Yopmail.Com")).toBe(true);
  });

  it("returns false for invalid emails", () => {
    expect(isDisposableEmail("notanemail")).toBe(false);
    expect(isDisposableEmail("")).toBe(false);
  });
});
