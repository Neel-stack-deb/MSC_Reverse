const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// ─── Serve static files ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ─── Ensure uploads directory exists ─────────────────────────────────────────
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Multer storage config ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// ─── File filter: allow only PDF and PPT/PPTX ────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
  ];
  const allowedExtensions = [".pdf"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed!"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
});

// ─── Upload endpoint ──────────────────────────────────────────────────────────
app.post("/api/upload", upload.single("document"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded." });
  }

  const fileInfo = {
    originalName: req.file.originalname,
    savedAs: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
    path: req.file.path,
  };

  console.log("📁 File uploaded:", fileInfo);

  // ─── Placeholder: LLM will be integrated here ────────────────────────────
  // For now, return mock questions to show the UI flow
  const mockQuestions = [
    {
      id: 1,
      question: "What is the primary objective discussed in this document?",
    },
    {
      id: 2,
      question: "Summarize the key concepts introduced in the first section.",
    },
    {
      id: 3,
      question: "What methodologies or approaches are highlighted?",
    },
    {
      id: 4,
      question: "Identify any conclusions or outcomes mentioned in the document.",
    },
    {
      id: 5,
      question: "What are the potential real-world applications of the topics covered?",
    },
    {
      id: 6,
      question: "Are there any limitations or challenges discussed in the document?",
    },
  ];

  res.json({
    success: true,
    message: "File uploaded and processed successfully!",
    file: fileInfo,
    questions: mockQuestions,
    note: "LLM integration pending — these are placeholder questions.",
  });
});

// ─── List uploaded files ──────────────────────────────────────────────────────
app.get("/api/files", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: "Could not read uploads directory." });
    res.json({ files });
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File too large. Max size is 50MB." });
    }
  }
  res.status(400).json({ success: false, message: err.message });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 MSC Club Server running at http://localhost:${PORT}`);
  console.log(`📂 Uploads stored in: ${uploadDir}\n`);
});
