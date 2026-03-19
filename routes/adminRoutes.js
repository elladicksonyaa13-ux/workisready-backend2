import express from "express";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { adminAuth } from "../middleware/auth.js"; // your new adminAuth middleware


const router = express.Router();

// GET all users (ADMIN)
// router.get("/users", adminAuth, async (req, res) => {
//   try {
//     const users = await User.find().select("-password");
//     res.json({ success: true, users });
//   } catch (err) {
//     res.status(500).json({ success: false, message: "Failed to fetch users" });
//   }
// });

// BLOCK / UNBLOCK user
router.patch("/users/:id/block", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      success: true,
      message: user.isBlocked ? "User blocked" : "User unblocked"
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update user" });
  }
});

// DELETE user
// router.delete("/users/:id", adminAuth, async (req, res) => {
//   try {
//     await User.findByIdAndDelete(req.params.id);
//     res.json({ success: true, message: "User deleted" });
//   } catch (err) {
//     res.status(500).json({ message: "Failed to delete user" });
//   }
// });

// UPDATE user info (ADMIN)
// router.put("/users/:id", adminAuth, async (req, res) => {
//   try {
//     const { fname, sname, email, phone, city, whatsapp, userType, profileImage } = req.body;

//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ success: false, message: "User not found" });

//     // Update fields
//     user.fname = fname ?? user.fname;
//     user.sname = sname ?? user.sname;
//     user.email = email ?? user.email;
//     user.phone = phone ?? user.phone;
//     user.whatsapp = whatsapp ?? user.whatsapp
//     user.city = city ?? user.city;
//     user.userType = userType ?? user.userType;
//     user.profileImage = profileImage ?? user.profileImage;

//     await user.save();

//     res.json({ success: true, message: "User updated successfully", user });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Failed to update user" });
//   }
// });



// CREATE USER (ADMIN)
// router.post("/users", adminAuth, async (req, res) => {
//   try {
//     const { name, email, password, phone } = req.body;

//     if (!name || !email || !password || !phone) {
//       return res.status(400).json({
//         success: false,
//         message: "All fields are required",
//       });
//     }

//     const exists = await User.findOne({ email });
//     if (exists) {
//       return res.status(400).json({
//         success: false,
//         message: "User already exists",
//       });
//     }

//     const user = await User.create({
//       name,
//       email,
//       password, // ✅ plain text
//       phone,
//       userType: "client",
//       isBlocked: false,
//     });

//     res.status(201).json({
//       success: true,
//       message: "User created successfully",
//       user: user.toSafeObject(),
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to create user",
//     });
//   }
// });





export default router;
