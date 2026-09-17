import express from "express";
import { processRequest } from "./controllers/requests.controller";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "AHVAAN Risk Engine is running",
  });
});

app.use("/", processRequest);

export default app;
