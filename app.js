import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import serviceLineRoutes from "./routes/serviceLineRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";
import rankingRoutes from "./routes/rankingRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import learnTogetherRoutes from "./routes/learnTogetherRoutes.js";
import appSettingRoutes from "./routes/appSettingRoutes.js";
import maintenance from "./middleware/maintenance.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(maintenance);

app.get("/health", (req, res) => {
    res.status(200).json({ message: "Server is running...." });
});

app.use("/api/auth", authRoutes);
app.use("/api/service-lines", serviceLineRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/ranking", rankingRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/learn-together", learnTogetherRoutes);
app.use("/api/app-settings", appSettingRoutes);

app.use(errorHandler);

export default app;
