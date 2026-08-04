import mongoose from "mongoose";

const connectDB = async () => {

  try {

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || "mongodb://127.0.0.1:27017/benedex-auth-service";
    const conn = await mongoose.connect(mongoUri);

    console.log(
      `MongoDB Connected: ${conn.connection.host}`
    );

  }

  catch (error) {

    console.log(error.message);
    process.exit(1);

  }

};

export default connectDB;