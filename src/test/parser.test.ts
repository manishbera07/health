import { describe, expect, it } from "vitest";
import { parseLine } from "@/lib/parser";

describe("parseLine", () => {
  it("parses a complete line", () => {
    const r = parseLine("LEAD_OFF=0,FINGER=1,MAX30103=1,ECG=2140,HR=82.0,SPO2=97.0")!;
    expect(r.finger_detected).toBe(1);
    expect(r.lead_on).toBe(1);
    expect(r.lead_off).toBe(0);
    expect(r.ecg).toBe(2140);
    expect(r.hr).toBe(82);
    expect(r.spo2).toBe(97);
    expect(r.max30103).toBe(1);
    expect(r.msg).toBeNull();
  });

  it("handles ECG=--- and MSG fields", () => {
    const r = parseLine(
      "LEAD_OFF=1,FINGER=1,MAX30103=1,ECG=---,MSG=Hold finger steady until values appear"
    )!;
    expect(r.ecg).toBeNull();
    expect(r.lead_on).toBe(0);
    expect(r.lead_off).toBe(1);
    expect(r.msg).toBe("Hold finger steady until values appear");
  });

  it("is order-independent and case-insensitive on keys", () => {
    const r = parseLine("hr=70,FINGER=0,lead_off=0,ECG=100")!;
    expect(r.hr).toBe(70);
    expect(r.finger_detected).toBe(0);
    expect(r.lead_on).toBe(1);
    expect(r.ecg).toBe(100);
  });

  it("returns null on garbage", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("hello world")).toBeNull();
  });
});
