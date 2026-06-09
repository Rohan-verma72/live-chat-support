import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/live-chat";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; 


export async function connectDatabase() {
  mongoose.set("strictQuery", true);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log("   Database -> MongoDB connected");
      return;
    } catch (err) {
      console.error(`❌ DB connect failed [${attempt}/${MAX_RETRIES}]: ${err.message}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed after ${MAX_RETRIES} attempts — fix MONGODB_URI in .env\n   Reason: ${err.message}`, { cause: err });
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function disconnectDatabase() {
  try {
    await mongoose.connection.close();
    console.log("   Database -> MongoDB disconnected gracefully");
  } catch (err) {
    console.error("   Error closing database connection:", err.message);
  }
}

mongoose.connection.on("error", (err) => {
  console.error("   MongoDB connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.log("   MongoDB disconnected");
});
