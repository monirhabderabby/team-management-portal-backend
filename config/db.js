import dns from "dns";
import mongoose from "mongoose";

const connectDB = async () => {
  if (process.env.NODE_ENV !== "production") {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(uri, {
    autoIndex: true,
  });
};

export default connectDB;
