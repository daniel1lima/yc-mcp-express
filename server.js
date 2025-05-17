const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const openApiRoutes = require("./routes/openapi");
const fetch = require("node-fetch");
const yaml = require("js-yaml");
const { startAndWaitForFlow } = require("./utils/gumloopUtil");

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Custom middleware to handle both JSON and YAML
app.use((req, res, next) => {
  if (
    req.headers["content-type"] === "application/x-yaml" ||
    req.headers["content-type"] === "text/yaml"
  ) {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        req.body = yaml.load(data);
        next();
      } catch (err) {
        next(err);
      }
    });
  } else {
    // Default to JSON parsing
    express.json({ limit: "50mb" })(req, res, next);
  }
});

app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
app.use("/api", openApiRoutes);

app.get("/health", async (req, res) => {
  return res.json("hi!");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: err.message,
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
