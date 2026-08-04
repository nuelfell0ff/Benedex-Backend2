import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// Configure CDN storage with automatic image optimization
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "benedex_course_thumbnails",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [{ width: 800, height: 450, crop: "limit", quality: "auto" }],
  },
});

// Export the upload middleware along with the cloudinary instance
export const upload = multer({ storage });
export default cloudinary;