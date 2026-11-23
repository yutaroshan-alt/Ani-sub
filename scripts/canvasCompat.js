"use strict";

const { Readable } = require("stream");

/**
 * node-canvas-e createPNGStream thake, kintu installed @napi-rs/canvas-e nai.
 * EI helper dui API-i support kore — pair commands old style-i chalbe.
 */
function createPNGStream(canvas) {
  if (canvas && typeof canvas.createPNGStream === "function") {
    return canvas.createPNGStream();
  }

  let png;
  if (canvas && typeof canvas.toBuffer === "function") {
    png = canvas.toBuffer("image/png");
  } else if (canvas && typeof canvas.encode === "function") {
    png = canvas.encode("png", 100);
  }

  if (!png || typeof png.then === "function") {
    throw new Error("This canvas package cannot export PNG synchronously");
  }

  return Readable.from([Buffer.from(png)]);
}

module.exports = { createPNGStream };
