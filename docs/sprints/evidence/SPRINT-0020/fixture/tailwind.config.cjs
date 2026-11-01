const path = require("node:path");

module.exports = {
  content: [
    path.resolve(__dirname, "../../../../../components/flow/EnvelopePreview.tsx"),
    path.resolve(__dirname, "./src.jsx"),
  ],
  theme: { extend: {} },
  plugins: [],
};
