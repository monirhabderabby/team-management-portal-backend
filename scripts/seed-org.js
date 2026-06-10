import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import ServiceLine from "../models/ServiceLine.js";
import Team from "../models/Team.js";

dotenv.config();

const serviceLines = [
  "CMS",
  "SMM",
  "Management",
  "App",
  "SEO",
  "Google Ads",
  "FSD",
  "UI/UX",
  "AI",
];

const teamsByServiceLine = {
  CMS: ["Wix Spark", "WP Knight Riders", "WP Titans", "NextGen WP"],
  SMM: ["Social Squad"],
  Management: ["Ops Core"],
  App: ["Dart Layer", "Dart Sparl"],
  SEO: ["SEO Growth"],
  "Google Ads": ["Ads Alpha"],
  FSD: ["Dev-X", "Elite Stack"],
  "UI/UX": ["Design Studio"],
  AI: ["AI Lab"],
};

const seedOrg = async () => {
  await connectDB();

  const createdServiceLines = new Map();

  for (const name of serviceLines) {
    const serviceLine = await ServiceLine.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, status: "active" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    createdServiceLines.set(name, serviceLine);
  }

  let teamCount = 0;
  for (const [serviceLineName, teamNames] of Object.entries(
    teamsByServiceLine,
  )) {
    const serviceLine = createdServiceLines.get(serviceLineName);
    if (!serviceLine) continue;

    for (const name of teamNames) {
      await Team.findOneAndUpdate(
        { name, serviceLine: serviceLine._id },
        {
          $setOnInsert: {
            name,
            serviceLine: serviceLine._id,
            status: "active",
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      teamCount += 1;
    }
  }

  console.log(
    `Seeded ${serviceLines.length} service lines and ${teamCount} teams.`,
  );
};

seedOrg()
  .catch((error) => {
    console.error("Organization seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
