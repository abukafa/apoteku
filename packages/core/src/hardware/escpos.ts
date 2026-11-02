export const ESC_POS = {
  INIT: new Uint8Array([0x1b, 0x40]),
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 0x02]),
  BOLD_ON: new Uint8Array([0x1b, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([0x1b, 0x45, 0x00]),
  FONT_NORMAL: new Uint8Array([0x1b, 0x21, 0x00]),
  FONT_DOUBLE_HEIGHT: new Uint8Array([0x1b, 0x21, 0x10]),
  FEED_3_LINES: new Uint8Array([0x1b, 0x64, 0x03]),
  PARTIAL_CUT: new Uint8Array([0x1d, 0x56, 0x01]),
  OPEN_CASH_DRAWER: new Uint8Array([0x1b, 0x70, 0x00, 0x32, 0xfa]),
};

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.append(ESC_POS.INIT);
  }

  append(bytes: Uint8Array) {
    this.buffer.push(...Array.from(bytes));
    return this;
  }

  text(str: string) {
    const encoder = new TextEncoder();
    this.buffer.push(...Array.from(encoder.encode(str)));
    return this;
  }

  line(str: string = "") {
    this.text(str + "\n");
    return this;
  }

  twoColumnRow(left: string, right: string, maxChars: number = 32) {
    const spaceLength = maxChars - (left.length + right.length);
    if (spaceLength > 0) {
      this.line(left + " ".repeat(spaceLength) + right);
    } else {
      this.line(left);
      this.line(" ".repeat(Math.max(0, maxChars - right.length)) + right);
    }
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
